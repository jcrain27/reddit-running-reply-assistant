import {
  CandidateStatus,
  DraftFinalAction,
  NotificationChannel,
  NotificationPriority,
  SubmissionMode,
  TrackedCommentSource,
  type TrackedRedditComment
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import {
  DEFAULT_COACHING_PRINCIPLES,
  DEFAULT_PROMPT_VERSIONS,
  MAX_RECENT_DRAFTS_FOR_SIMILARITY
} from "@/lib/constants";
import { createStructuredCompletion } from "@/lib/services/openaiClient";
import { dispatchReplyNotifications } from "@/lib/services/notificationService";
import {
  extractCommentIdFromPermalink,
  fetchRepliesForComment,
  redditThingIdFromCommentId,
  submitComment
} from "@/lib/services/redditClient";
import { validateDraft } from "@/lib/services/safetyService";
import { getAppSettings } from "@/lib/services/settingsService";
import { buildEffectiveSubredditSettings } from "@/lib/services/subredditRulesService";
import type { CommentReplyDraftGenerationResult, RedditComment } from "@/lib/types";
import {
  computeEditDistance,
  inferReplyShortened,
  inferToneSoftened,
  normalizeWhitespace,
  truncate
} from "@/lib/utils";

function buildDefaultSubredditRuleContext(subreddit: string) {
  return {
    id: `default-${subreddit}`,
    name: subreddit,
    enabled: true,
    allowDirectSubmit: false,
    allowCTA: false,
    strictNoPromo: true,
    maxRepliesPerDay: 5,
    minAdviceScore: 50,
    maxReplyLength: 700,
    advancedTone: false,
    medicalCautionStrictness: 70,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    rules: []
  } satisfies Parameters<typeof buildEffectiveSubredditSettings>[0]["config"];
}

function scoreConversationReply(input: {
  reply: RedditComment;
  trackedComment: TrackedRedditComment;
  notificationThreshold: number;
  medicalRiskKeywords: string[];
}) {
  const text = normalizeWhitespace(input.reply.body).toLowerCase();
  let responseIntentScore = 15;
  let conversationFitScore = 25;
  let medicalRiskScore = 0;

  if (text.includes("?")) {
    responseIntentScore += 30;
  }

  if (/\b(how|why|what|would|should|can|could)\b/.test(text)) {
    responseIntentScore += 20;
  }

  if (/\b(thanks|thank you|appreciate it|helpful)\b/.test(text)) {
    responseIntentScore += 12;
    conversationFitScore += 12;
  }

  if (/\b(disagree|not sure|but|however|actually|counterpoint|what about)\b/.test(text)) {
    responseIntentScore += 20;
    conversationFitScore += 18;
  }

  if (text.length >= 60) {
    conversationFitScore += 18;
  }

  if (text.length <= 10) {
    conversationFitScore -= 10;
  }

  for (const keyword of input.medicalRiskKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      medicalRiskScore += 22;
    }
  }

  if (/\b(chest pain|faint|fracture|stress fracture|can.t bear weight|can’t bear weight)\b/.test(text)) {
    medicalRiskScore += 35;
  }

  responseIntentScore = Math.max(0, Math.min(100, responseIntentScore));
  conversationFitScore = Math.max(0, Math.min(100, conversationFitScore));
  medicalRiskScore = Math.max(0, Math.min(100, medicalRiskScore));

  const priorityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(responseIntentScore * 0.52 + conversationFitScore * 0.33 + (100 - medicalRiskScore) * 0.15)
    )
  );

  const selectedReason = /\?$/.test(text) || text.includes("?")
    ? "Direct reply asks a follow-up question worth answering naturally."
    : /\b(thanks|thank you|appreciate it|helpful)\b/.test(text)
      ? "Direct reply is engaging back with Johnny and is a good opportunity for a natural follow-up."
      : "Direct reply adds conversation context that is worth a human-reviewed response.";

  const priority =
    priorityScore >= input.notificationThreshold
      ? "HIGH"
      : priorityScore >= 55
        ? "NORMAL"
        : "LOW";

  const shouldDraft =
    !/^\[deleted\]$/.test(input.reply.author) &&
    !/^\[removed\]$/i.test(input.reply.body) &&
    priorityScore >= 35 &&
    medicalRiskScore < 85;

  return {
    responseIntentScore,
    conversationFitScore,
    medicalRiskScore,
    priorityScore,
    selectedReason,
    shouldDraft,
    priority
  } as const;
}

function inferReplyFallbackType(reply: RedditComment) {
  const text = normalizeWhitespace(reply.body).toLowerCase();
  if (/\b(thanks|thank you|appreciate it)\b/.test(text)) {
    return "gratitude";
  }
  if (text.includes("?")) {
    return "question";
  }
  if (/\b(disagree|not sure|however|but|actually|counterpoint)\b/.test(text)) {
    return "pushback";
  }
  if (/\b(chest pain|fracture|pain|doctor|physio|faint)\b/.test(text)) {
    return "medical";
  }
  return "general";
}

function buildTeachingPrinciplesContext() {
  return DEFAULT_COACHING_PRINCIPLES.map((principle) => `- ${principle}`).join("\n");
}

export async function generateCommentReplyDraft(input: {
  reply: RedditComment;
  trackedComment: TrackedRedditComment;
  recentDrafts: Array<{
    draftText: string;
    openingLine?: string | null;
  }>;
  subredditContext: Awaited<ReturnType<typeof buildEffectiveSubredditSettings>>;
}) : Promise<CommentReplyDraftGenerationResult> {
  const env = getEnv();
  const systemPrompt = [
    "You draft Reddit follow-up comments for Johnny Crain at RunFitCoach.",
    "This is a reply in an ongoing comment thread, not a first-touch top-level reply.",
    "Output JSON only with coreReply, alternateReply, confidence, reasoning.",
    "Voice: natural, grounded, direct, helpful, conversational.",
    "Answer the actual comment that came in.",
    "No selling. No CTA unless the human later adds one manually.",
    "Do not diagnose or act medically certain.",
    "Teach through principles, not hype.",
    "For follow-up replies, keep the conversation natural: answer what the person actually said, name the principle underneath it, and give one practical next step or clarification.",
    `Core teaching principles:\n${buildTeachingPrinciplesContext()}`,
    input.subredditContext.defaultReplyStyle
      ? `Style preference: ${input.subredditContext.defaultReplyStyle}.`
      : "",
    input.subredditContext.styleHints.length
      ? `Style hints: ${input.subredditContext.styleHints.join(" | ")}.`
      : ""
  ]
    .filter(Boolean)
    .join(" ");

  const userPrompt = JSON.stringify({
    subreddit: input.reply.subreddit,
    originalPostTitle: input.trackedComment.parentPostTitle,
    originalPostBody: truncate(input.trackedComment.parentPostBody ?? "", 1200),
    johnnyComment: truncate(input.trackedComment.bodyText, 1200),
    incomingReply: truncate(input.reply.body, 1200),
    recentOpenings: input.recentDrafts
      .map((draft) => draft.openingLine || draft.draftText)
      .slice(0, 10),
    bannedPhrases: input.subredditContext.bannedPhrases.slice(0, 12)
  });

  try {
    const response = await createStructuredCompletion<{
      coreReply: string;
      alternateReply: string;
      confidence: number;
      reasoning: string;
    }>({
      systemPrompt,
      userPrompt,
      temperature: 0.45
    });

    if (response?.coreReply) {
      return {
        coreReply: normalizeWhitespace(response.coreReply),
        alternateReply: normalizeWhitespace(response.alternateReply || response.coreReply),
        confidence:
          typeof response.confidence === "number"
            ? Math.max(0, Math.min(1, response.confidence))
            : 0.66,
        reasoning: normalizeWhitespace(response.reasoning || "Generated by OpenAI."),
        modelName: env.OPENAI_MODEL
      };
    }
  } catch (error) {
    console.error(
      "Comment reply draft generation fell back to local template:",
      error instanceof Error ? error.message : error
    );
  }

  const fallbackType = inferReplyFallbackType(input.reply);
  const fallback =
    fallbackType === "gratitude"
      ? {
          coreReply: "Glad it helped. A lot of this really does come down to keeping the basics boring and repeatable for a while.",
          alternateReply: "Glad that landed. If you keep the next couple of weeks simple and consistent, you’ll usually get a much clearer read on what’s actually working."
        }
      : fallbackType === "question"
        ? {
            coreReply: "Good question. Based on what you asked, I’d keep the answer pretty simple and choose the option that keeps the overall training week more repeatable instead of more aggressive.",
            alternateReply: "That’s the right follow-up to ask. I’d usually make that call by asking which option gives you cleaner training, not which one looks harder on paper."
          }
        : fallbackType === "pushback"
          ? {
              coreReply: "That’s fair. I’m not saying there’s only one right way to do it, more that I’d bias toward the option that is easier to recover from and repeat well.",
              alternateReply: "Fair pushback. My angle is mostly about what tends to be more sustainable in the context of the full week, not about a rigid rule."
            }
          : fallbackType === "medical"
            ? {
                coreReply: "At that point I’d stay conservative and not try to solve it like a normal training question. If symptoms are escalating or affecting daily movement, a clinician is the better next step.",
                alternateReply: "That starts to move out of normal training territory for me. I’d be careful about guessing and get it looked at properly if it isn’t settling down quickly."
              }
            : {
                coreReply: "That makes sense. I’d keep the next step smaller than it seems like you want and use the next few runs to confirm you’re moving in the right direction.",
                alternateReply: "I’d probably stay pretty simple here and make the next decision based on what gives you the most consistent week, not the most aggressive one."
              };

  return {
    ...fallback,
    confidence: 0.58,
    reasoning: "Fallback follow-up draft used because the OpenAI request was unavailable.",
    modelName: "fallback-template"
  };
}

async function createTrackedComment(input: {
  postCandidateId?: string;
  commentReplyCandidateId?: string;
  redditCommentId: string;
  subreddit: string;
  author?: string | null;
  commentPermalink: string;
  parentPostPermalink: string;
  parentPostTitle?: string | null;
  parentPostBody?: string | null;
  bodyText: string;
  source: TrackedCommentSource;
}) {
  return prisma.trackedRedditComment.upsert({
    where: { redditCommentId: input.redditCommentId },
    update: {
      postCandidateId: input.postCandidateId || null,
      commentReplyCandidateId: input.commentReplyCandidateId || null,
      subreddit: input.subreddit,
      author: input.author || null,
      commentPermalink: input.commentPermalink,
      parentPostPermalink: input.parentPostPermalink,
      parentPostTitle: input.parentPostTitle || null,
      parentPostBody: input.parentPostBody || null,
      bodyText: input.bodyText,
      source: input.source,
      monitoringEnabled: true
    },
    create: {
      postCandidateId: input.postCandidateId || null,
      commentReplyCandidateId: input.commentReplyCandidateId || null,
      redditCommentId: input.redditCommentId,
      redditThingId: redditThingIdFromCommentId(input.redditCommentId),
      subreddit: input.subreddit,
      author: input.author || null,
      commentPermalink: input.commentPermalink,
      parentPostPermalink: input.parentPostPermalink,
      parentPostTitle: input.parentPostTitle || null,
      parentPostBody: input.parentPostBody || null,
      bodyText: input.bodyText,
      source: input.source
    }
  });
}

export async function trackManualCommentForPostCandidate(input: {
  candidateId: string;
  commentPermalink: string;
  commentText?: string;
}) {
  const candidate = await prisma.postCandidate.findUnique({
    where: { id: input.candidateId },
    include: {
      draftReplies: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!candidate) {
    throw new Error("Candidate not found.");
  }

  const redditCommentId = extractCommentIdFromPermalink(input.commentPermalink);
  if (!redditCommentId) {
    throw new Error("Could not parse a Reddit comment id from that permalink.");
  }

  const commentText =
    normalizeWhitespace(input.commentText || "") ||
    candidate.draftReplies[0]?.humanEditedText ||
    candidate.draftReplies[0]?.draftText ||
    "";

  const tracked = await createTrackedComment({
    postCandidateId: candidate.id,
    redditCommentId,
    subreddit: candidate.subreddit,
    author: getEnv().REDDIT_USERNAME ?? null,
    commentPermalink: input.commentPermalink,
    parentPostPermalink: candidate.permalink,
    parentPostTitle: candidate.title,
    parentPostBody: candidate.bodyText,
    bodyText: commentText,
    source: TrackedCommentSource.MANUAL_TRACK
  });

  await prisma.postCandidate.update({
    where: { id: candidate.id },
    data: {
      alreadyReplied: true,
      status:
        candidate.status === CandidateStatus.SUBMITTED
          ? CandidateStatus.SUBMITTED
          : CandidateStatus.APPROVED
    }
  });

  return tracked;
}

export async function trackManualCommentForCommentReplyCandidate(input: {
  commentReplyCandidateId: string;
  commentPermalink: string;
  commentText?: string;
}) {
  const candidate = await prisma.commentReplyCandidate.findUnique({
    where: { id: input.commentReplyCandidateId },
    include: {
      trackedComment: true,
      draftReplies: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!candidate) {
    throw new Error("Reply candidate not found.");
  }

  const redditCommentId = extractCommentIdFromPermalink(input.commentPermalink);
  if (!redditCommentId) {
    throw new Error("Could not parse a Reddit comment id from that permalink.");
  }

  const commentText =
    normalizeWhitespace(input.commentText || "") ||
    candidate.draftReplies[0]?.humanEditedText ||
    candidate.draftReplies[0]?.draftText ||
    "";

  const tracked = await createTrackedComment({
    commentReplyCandidateId: candidate.id,
    redditCommentId,
    subreddit: candidate.subreddit,
    author: getEnv().REDDIT_USERNAME ?? null,
    commentPermalink: input.commentPermalink,
    parentPostPermalink: candidate.parentPostPermalink,
    parentPostTitle: candidate.parentPostTitle,
    parentPostBody: candidate.trackedComment.parentPostBody,
    bodyText: commentText,
    source: TrackedCommentSource.MANUAL_TRACK
  });

  await prisma.commentReplyCandidate.update({
    where: { id: candidate.id },
    data: {
      status:
        candidate.status === CandidateStatus.SUBMITTED
          ? CandidateStatus.SUBMITTED
          : CandidateStatus.APPROVED
    }
  });

  return tracked;
}

export async function processTrackedCommentReplies() {
  const [trackedComments, appSettings] = await Promise.all([
    prisma.trackedRedditComment.findMany({
      where: { monitoringEnabled: true },
      orderBy: { updatedAt: "desc" },
      take: 100
    }),
    getAppSettings()
  ]);

  let scannedReplies = 0;
  let createdCandidates = 0;
  let draftedReplies = 0;
  const notes: string[] = [];

  for (const trackedComment of trackedComments) {
    try {
      const [replies, config, recentDrafts] = await Promise.all([
        fetchRepliesForComment(trackedComment.commentPermalink),
        prisma.subredditConfig.findUnique({
          where: { name: trackedComment.subreddit },
          include: { rules: true }
        }),
        prisma.commentReplyDraft.findMany({
          orderBy: { createdAt: "desc" },
          take: MAX_RECENT_DRAFTS_FOR_SIMILARITY,
          select: {
            draftText: true,
            openingLine: true
          }
        })
      ]);

      scannedReplies += replies.length;
      const subredditContext = buildEffectiveSubredditSettings({
        config: config ?? buildDefaultSubredditRuleContext(trackedComment.subreddit),
        appSettings: {
          bannedPhrases: appSettings.bannedPhrases as string[],
          medicalRiskKeywords: appSettings.medicalRiskKeywords as string[]
        }
      });

      for (const reply of replies) {
        const env = getEnv();
        if (
          reply.author === "[deleted]" ||
          (trackedComment.author && reply.author === trackedComment.author) ||
          (env.REDDIT_USERNAME && reply.author.toLowerCase() === env.REDDIT_USERNAME.toLowerCase())
        ) {
          continue;
        }

        const existing = await prisma.commentReplyCandidate.findUnique({
          where: { redditCommentId: reply.id },
          select: { id: true }
        });

        if (existing) {
          continue;
        }

        const score = scoreConversationReply({
          reply,
          trackedComment,
          notificationThreshold: appSettings.notificationThreshold,
          medicalRiskKeywords: subredditContext.medicalRiskKeywords
        });

        if (!score.shouldDraft) {
          continue;
        }

        const created = await prisma.commentReplyCandidate.create({
          data: {
            trackedCommentId: trackedComment.id,
            redditCommentId: reply.id,
            redditThingId: reply.name,
            subreddit: reply.subreddit.toLowerCase(),
            author: reply.author,
            permalink: reply.permalink,
            parentPostPermalink: trackedComment.parentPostPermalink,
            parentPostTitle: trackedComment.parentPostTitle,
            bodyText: reply.body,
            createdUtc: new Date(reply.createdUtc * 1000),
            fetchedAt: new Date(),
            score: reply.score,
            responseIntentScore: score.responseIntentScore,
            conversationFitScore: score.conversationFitScore,
            medicalRiskScore: score.medicalRiskScore,
            priorityScore: score.priorityScore,
            selectedReason: score.selectedReason,
            notificationPriority:
              score.priority === "HIGH"
                ? NotificationPriority.HIGH
                : score.priority === "NORMAL"
                  ? NotificationPriority.NORMAL
                  : NotificationPriority.LOW
          }
        });

        createdCandidates += 1;

        const draft = await generateCommentReplyDraft({
          reply,
          trackedComment,
          recentDrafts,
          subredditContext
        });

        const safety = validateDraft({
          draftText: draft.coreReply,
          optionalCTA: "",
          recentDrafts,
          bannedPhrases: subredditContext.bannedPhrases,
          maxReplyLength: config?.maxReplyLength ?? 700
        });

        await prisma.commentReplyDraft.create({
          data: {
            commentReplyCandidateId: created.id,
            modelName: draft.modelName,
            systemPromptVersion: DEFAULT_PROMPT_VERSIONS.system,
            userPromptVersion: DEFAULT_PROMPT_VERSIONS.user,
            draftText: draft.coreReply,
            alternateDraftText: draft.alternateReply,
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

        await prisma.commentReplyCandidate.update({
          where: { id: created.id },
          data: {
            status: safety.approved ? CandidateStatus.DRAFTED : CandidateStatus.REVIEWED
          }
        });

        draftedReplies += 1;
        recentDrafts.unshift({
          draftText: draft.coreReply,
          openingLine: safety.openingLine
        });
        recentDrafts.splice(MAX_RECENT_DRAFTS_FOR_SIMILARITY);

        if (appSettings.notificationEmailEnabled || appSettings.notificationSlackEnabled) {
          const notificationResults = await dispatchReplyNotifications({
            replyCandidate: {
              id: created.id,
              subreddit: created.subreddit,
              author: created.author,
              permalink: created.permalink,
              parentPostTitle: created.parentPostTitle || "Reply to your comment",
              selectedReason: created.selectedReason,
              priorityScore: created.priorityScore
            },
            draft: {
              draftText: draft.coreReply
            },
            appSettings: {
              notificationEmailEnabled: appSettings.notificationEmailEnabled,
              notificationSlackEnabled: appSettings.notificationSlackEnabled,
              notificationEmailTo: appSettings.notificationEmailTo,
              notificationSlackWebhookUrl: appSettings.notificationSlackWebhookUrl
            }
          });

          for (const entry of notificationResults) {
            await prisma.commentReplyNotificationEvent.create({
              data: {
                commentReplyCandidateId: created.id,
                channel:
                  entry.channel === "EMAIL"
                    ? NotificationChannel.EMAIL
                    : NotificationChannel.SLACK,
                success: entry.success,
                errorMessage: entry.errorMessage ?? null
              }
            });
          }
        }
      }

      await prisma.trackedRedditComment.update({
        where: { id: trackedComment.id },
        data: {
          lastCheckedAt: new Date(),
          lastReplySeenAt:
            replies.length > 0
              ? new Date(Math.max(...replies.map((reply) => reply.createdUtc * 1000)))
              : trackedComment.lastReplySeenAt
        }
      });
    } catch (error) {
      notes.push(
        `Reply scan failed for tracked comment ${trackedComment.redditCommentId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  return {
    scannedReplies,
    createdCandidates,
    draftedReplies,
    notes
  };
}

export async function regenerateCommentReplyDraft(input: {
  candidateId: string;
}) {
  const candidate = await prisma.commentReplyCandidate.findUnique({
    where: { id: input.candidateId },
    include: { trackedComment: true }
  });

  if (!candidate) {
    throw new Error("Reply candidate not found.");
  }

  const [appSettings, recentDrafts, config] = await Promise.all([
    getAppSettings(),
    prisma.commentReplyDraft.findMany({
      orderBy: { createdAt: "desc" },
      take: MAX_RECENT_DRAFTS_FOR_SIMILARITY,
      select: {
        draftText: true,
        openingLine: true
      }
    }),
    prisma.subredditConfig.findUnique({
      where: { name: candidate.subreddit },
      include: { rules: true }
    })
  ]);

  const subredditContext = buildEffectiveSubredditSettings({
    config: config ?? buildDefaultSubredditRuleContext(candidate.subreddit),
    appSettings: {
      bannedPhrases: appSettings.bannedPhrases as string[],
      medicalRiskKeywords: appSettings.medicalRiskKeywords as string[]
    }
  });

  const draft = await generateCommentReplyDraft({
    reply: {
      id: candidate.redditCommentId,
      name: candidate.redditThingId,
      author: candidate.author,
      body: candidate.bodyText,
      subreddit: candidate.subreddit,
      permalink: candidate.permalink,
      createdUtc: Math.floor(candidate.createdUtc.getTime() / 1000),
      score: candidate.score ?? 0
    },
    trackedComment: candidate.trackedComment,
    recentDrafts,
    subredditContext
  });

  const safety = validateDraft({
    draftText: draft.coreReply,
    optionalCTA: "",
    recentDrafts,
    bannedPhrases: subredditContext.bannedPhrases,
    maxReplyLength: config?.maxReplyLength ?? 700
  });

  const created = await prisma.commentReplyDraft.create({
    data: {
      commentReplyCandidateId: candidate.id,
      modelName: draft.modelName,
      systemPromptVersion: DEFAULT_PROMPT_VERSIONS.system,
      userPromptVersion: DEFAULT_PROMPT_VERSIONS.user,
      draftText: draft.coreReply,
      alternateDraftText: draft.alternateReply,
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

  await prisma.commentReplyCandidate.update({
    where: { id: candidate.id },
    data: {
      status: safety.approved ? CandidateStatus.DRAFTED : CandidateStatus.REVIEWED
    }
  });

  return created;
}

export async function archiveCommentReplyCandidate(candidateId: string) {
  const latestDraft = await prisma.commentReplyDraft.findFirst({
    where: { commentReplyCandidateId: candidateId },
    orderBy: { createdAt: "desc" }
  });

  await prisma.$transaction([
    prisma.commentReplyCandidate.update({
      where: { id: candidateId },
      data: { status: CandidateStatus.ARCHIVED }
    }),
    ...(latestDraft
      ? [
          prisma.commentReplyDraft.update({
            where: { id: latestDraft.id },
            data: { finalAction: DraftFinalAction.ARCHIVE }
          })
        ]
      : [])
  ]);
}

export async function skipCommentReplyCandidate(candidateId: string) {
  const latestDraft = await prisma.commentReplyDraft.findFirst({
    where: { commentReplyCandidateId: candidateId },
    orderBy: { createdAt: "desc" }
  });

  await prisma.$transaction([
    prisma.commentReplyCandidate.update({
      where: { id: candidateId },
      data: { status: CandidateStatus.SKIPPED }
    }),
    ...(latestDraft
      ? [
          prisma.commentReplyDraft.update({
            where: { id: latestDraft.id },
            data: { finalAction: DraftFinalAction.SKIP }
          })
        ]
      : [])
  ]);
}

export async function saveCommentReplyEdit(input: {
  candidateId: string;
  humanEditedText: string;
  finalAction: "NONE" | "COPY";
}) {
  const latestDraft = await prisma.commentReplyDraft.findFirst({
    where: { commentReplyCandidateId: input.candidateId },
    orderBy: { createdAt: "desc" }
  });

  if (!latestDraft) {
    throw new Error("Reply draft not found.");
  }

  const finalAction =
    input.finalAction === "COPY" ? DraftFinalAction.COPY : DraftFinalAction.NONE;

  await prisma.$transaction([
    prisma.commentReplyDraft.update({
      where: { id: latestDraft.id },
      data: {
        humanEditedText: input.humanEditedText,
        finalAction,
        editDistance: computeEditDistance(latestDraft.draftText, input.humanEditedText),
        replyShortened: inferReplyShortened(latestDraft.draftText, input.humanEditedText),
        toneSoftened: inferToneSoftened(latestDraft.draftText, input.humanEditedText)
      }
    }),
    prisma.commentReplyCandidate.update({
      where: { id: input.candidateId },
      data: {
        status:
          input.finalAction === "COPY"
            ? CandidateStatus.APPROVED
            : CandidateStatus.REVIEWED
      }
    })
  ]);

  if (input.finalAction === "COPY") {
    const existing = await prisma.commentReplySubmission.findFirst({
      where: {
        commentReplyCandidateId: input.candidateId,
        commentReplyDraftId: latestDraft.id,
        submissionMode: SubmissionMode.MANUAL_COPY,
        success: true
      }
    });

    if (!existing) {
      await prisma.commentReplySubmission.create({
        data: {
          commentReplyCandidateId: input.candidateId,
          commentReplyDraftId: latestDraft.id,
          submissionMode: SubmissionMode.MANUAL_COPY,
          success: true
        }
      });
    }
  }
}

export async function submitApprovedCommentReply(input: {
  candidateId: string;
  draftId: string;
  replyText: string;
}) {
  const [candidate, draft, appSettings] = await Promise.all([
    prisma.commentReplyCandidate.findUnique({
      where: { id: input.candidateId },
      include: { trackedComment: true }
    }),
    prisma.commentReplyDraft.findUnique({
      where: { id: input.draftId }
    }),
    getAppSettings()
  ]);

  if (!candidate || !draft) {
    throw new Error("Reply candidate or draft not found.");
  }

  const config = await prisma.subredditConfig.findUnique({
    where: { name: candidate.subreddit }
  });

  if (!appSettings.enableDirectSubmit || !config?.allowDirectSubmit) {
    throw new Error("Direct submit is disabled for this app or subreddit.");
  }

  try {
    const redditCommentId = await submitComment(candidate.redditThingId, input.replyText);
    const newPermalink = `${candidate.parentPostPermalink.replace(/\/+$/, "")}/${redditCommentId}/`;

    await prisma.$transaction([
      prisma.commentReplySubmission.create({
        data: {
          commentReplyCandidateId: candidate.id,
          commentReplyDraftId: draft.id,
          submissionMode: SubmissionMode.DIRECT_SUBMIT,
          redditCommentId,
          success: true
        }
      }),
      prisma.commentReplyDraft.update({
        where: { id: draft.id },
        data: {
          humanEditedText: input.replyText,
          finalAction: DraftFinalAction.SUBMIT,
          editDistance: computeEditDistance(draft.draftText, input.replyText),
          replyShortened: inferReplyShortened(draft.draftText, input.replyText),
          toneSoftened: inferToneSoftened(draft.draftText, input.replyText)
        }
      }),
      prisma.commentReplyCandidate.update({
        where: { id: candidate.id },
        data: {
          status: CandidateStatus.SUBMITTED
        }
      })
    ]);

    await createTrackedComment({
      commentReplyCandidateId: candidate.id,
      redditCommentId,
      subreddit: candidate.subreddit,
      author: getEnv().REDDIT_USERNAME ?? null,
      commentPermalink: newPermalink,
      parentPostPermalink: candidate.parentPostPermalink,
      parentPostTitle: candidate.parentPostTitle,
      parentPostBody: candidate.trackedComment.parentPostBody,
      bodyText: input.replyText,
      source: TrackedCommentSource.DIRECT_SUBMIT
    });

    return { success: true, redditCommentId };
  } catch (error) {
    await prisma.$transaction([
      prisma.commentReplySubmission.create({
        data: {
          commentReplyCandidateId: candidate.id,
          commentReplyDraftId: draft.id,
          submissionMode: SubmissionMode.DIRECT_SUBMIT,
          success: false,
          errorMessage: error instanceof Error ? error.message : "Unknown reply submission error"
        }
      }),
      prisma.commentReplyCandidate.update({
        where: { id: candidate.id },
        data: { status: CandidateStatus.FAILED }
      })
    ]);

    throw error;
  }
}
