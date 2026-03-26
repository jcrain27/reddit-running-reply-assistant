import { CandidateStatus, DraftFinalAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { DEFAULT_PROMPT_VERSIONS, MAX_RECENT_DRAFTS_FOR_SIMILARITY } from "@/lib/constants";
import { listBlogPostsForMatching, recommendBlogPost } from "@/lib/services/blogSyncService";
import { generateDraft } from "@/lib/services/draftService";
import { buildEffectiveSubredditSettings } from "@/lib/services/subredditRulesService";
import { validateDraft } from "@/lib/services/safetyService";
import { getAppSettings } from "@/lib/services/settingsService";
import { requireRouteAuth } from "@/lib/routeAuth";

const regenerateSchema = z.object({
  toneVariant: z.enum(["default", "alternate", "cautious"]).optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRouteAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = regenerateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid regenerate payload." }, { status: 400 });
  }

  const candidate = await prisma.postCandidate.findUnique({
    where: { id }
  });

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  const [config, appSettings, voiceExamples, recentDrafts, blogPosts] = await Promise.all([
    prisma.subredditConfig.findUnique({
      where: { name: candidate.subreddit },
      include: { rules: true }
    }),
    getAppSettings(),
    prisma.voiceExample.findMany({
      where: { enabled: true },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.draftReply.findMany({
      orderBy: { createdAt: "desc" },
      take: MAX_RECENT_DRAFTS_FOR_SIMILARITY,
      select: {
        draftText: true,
        optionalCTAText: true,
        openingLine: true
      }
    }),
    listBlogPostsForMatching()
  ]);

  if (!config) {
    return NextResponse.json({ error: "Subreddit config not found." }, { status: 404 });
  }

  const effectiveSubreddit = buildEffectiveSubredditSettings({
    config,
    appSettings: {
      bannedPhrases: appSettings.bannedPhrases as string[],
      medicalRiskKeywords: appSettings.medicalRiskKeywords as string[]
    }
  });
  const recommendedBlog = await recommendBlogPost({
    postTitle: candidate.title,
    postBodyText: candidate.bodyText,
    blogPosts
  });

  const draft = await generateDraft({
    post: {
      id: candidate.redditPostId,
      name: candidate.thingId || candidate.redditPostId,
      subreddit: candidate.subreddit,
      title: candidate.title,
      author: candidate.author,
      selftext: candidate.bodyText,
      permalink: candidate.permalink,
      url: candidate.url || candidate.permalink,
      createdUtc: Math.floor(candidate.createdUtc.getTime() / 1000),
      score: candidate.score || 0,
      numComments: candidate.numComments || 0,
      isSelf: true,
      removedByCategory: null,
      over18: false
    },
    config,
    appSettings: {
      enableCTASuggestions: appSettings.enableCTASuggestions
    },
    voiceExamples,
    recommendedBlog,
    ruleContext: effectiveSubreddit,
    recentDrafts,
    toneVariant: parsed.data.toneVariant
  });

  const safety = validateDraft({
    draftText: draft.coreReply,
    optionalCTA: draft.optionalCTA,
    recentDrafts,
    bannedPhrases: effectiveSubreddit.bannedPhrases,
    maxReplyLength: config.maxReplyLength
  });

  const created = await prisma.draftReply.create({
    data: {
      postCandidateId: candidate.id,
      modelName: draft.modelName,
      systemPromptVersion: DEFAULT_PROMPT_VERSIONS.system,
      userPromptVersion: DEFAULT_PROMPT_VERSIONS.user,
      draftText: draft.coreReply,
      alternateDraftText: draft.alternateReply,
      optionalCTAText: draft.optionalCTA,
      recommendedBlogPostId: draft.recommendedBlog?.id,
      recommendedBlogReason: draft.recommendedBlog?.reason,
      recommendedBlogMatchScore: draft.recommendedBlog?.matchScore,
      ctaAllowed: Boolean(appSettings.enableCTASuggestions && config.allowCTA && !config.strictNoPromo),
      confidence: draft.confidence,
      generationReasoning: draft.reasoning,
      safetyWarnings: safety.warnings,
      openingLine: safety.openingLine,
      duplicateRiskScore: safety.duplicateRiskScore,
      promotionalRiskScore: safety.promotionalRiskScore,
      medicalCertaintyRiskScore: safety.medicalCertaintyRiskScore,
      finalAction: DraftFinalAction.NONE
    }
  });

  await prisma.postCandidate.update({
    where: { id: candidate.id },
    data: {
      status: safety.approved ? CandidateStatus.DRAFTED : CandidateStatus.REVIEWED
    }
  });

  return NextResponse.json({ ok: true, draftReplyId: created.id });
}
