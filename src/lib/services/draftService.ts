import type { SubredditConfig, VoiceExample } from "@prisma/client";

import { DEFAULT_PROMPT_VERSIONS } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { createStructuredCompletion } from "@/lib/services/openaiClient";
import type { EffectiveSubredditSettings } from "@/lib/services/subredditRulesService";
import type { DraftGenerationResult, RedditPost } from "@/lib/types";
import { extractFirstLine, normalizeWhitespace, truncate } from "@/lib/utils";

interface GenerateDraftInput {
  post: RedditPost;
  config: SubredditConfig;
  appSettings: {
    enableCTASuggestions: boolean;
  };
  voiceExamples: VoiceExample[];
  ruleContext?: EffectiveSubredditSettings;
  recentDrafts: Array<{
    draftText: string;
    optionalCTAText?: string | null;
    openingLine?: string | null;
  }>;
  toneVariant?: "default" | "alternate" | "cautious";
}

interface DraftModelResponse {
  coreReply: string;
  alternateReply: string;
  optionalCTA: string;
  confidence: number;
  reasoning: string;
}

function buildVoiceContext(voiceExamples: VoiceExample[]) {
  return voiceExamples
    .filter((example) => example.enabled)
    .slice(0, 6)
    .map((example) => `- ${example.label}: ${normalizeWhitespace(example.content)}`)
    .join("\n");
}

function inferFallbackTopic(post: RedditPost) {
  const text = normalizeWhitespace(`${post.title} ${post.selftext}`).toLowerCase();

  if (/\b(chest pain|faint|fracture|stress fracture|can.t bear weight|can’t bear weight|swelling|doctor|physio)\b/.test(text)) {
    return "medical";
  }

  if (/\b(pace|pacing|splits|race pace)\b/.test(text)) {
    return "pacing";
  }

  if (/\b(mileage|mpw|weekly mileage|volume|base building)\b/.test(text)) {
    return "mileage";
  }

  if (/\b(long run|marathon|half marathon|5k|10k|race strategy|taper)\b/.test(text)) {
    return "race";
  }

  if (/\b(cadence|form|stride)\b/.test(text)) {
    return "form";
  }

  if (/\b(recovery|rest day|sore|fatigue|tired|burnt out|overtrained)\b/.test(text)) {
    return "recovery";
  }

  if (/\b(beginner|new runner|first marathon|just started)\b/.test(text)) {
    return "beginner";
  }

  if (/\b(trail|elevation|climb|technical)\b/.test(text)) {
    return "trail";
  }

  if (/\b(workout|tempo|threshold|vo2|max|interval)\b/.test(text)) {
    return "workout";
  }

  return "general";
}

function buildTopicSpecificFallback(input: GenerateDraftInput) {
  const topic = inferFallbackTopic(input.post);
  const advanced = input.config.advancedTone;
  const defaultLead =
    input.ruleContext?.defaultReplyStyle?.toLowerCase().includes("blunt")
      ? "I’d keep this pretty direct."
      : advanced
        ? "I’d zoom out and keep it simple."
        : "I’d keep the next step straightforward.";

  switch (topic) {
    case "medical":
      return {
        core: `${defaultLead} This sounds more medical than training-related, so I would not try to solve it with a harder workout or a Reddit diagnosis. If symptoms are sharp, escalating, or affecting normal walking or daily life, a clinician is the better next step.`,
        alternate:
          "If the main issue is pain or a red-flag symptom, I’d be conservative here. Back off the load and get proper medical guidance instead of trying to train through it.",
        cta: ""
      };
    case "pacing":
      return {
        core: `${defaultLead} If pacing is the question, the usual fix is to start a little easier than your ego wants and keep the effort stable instead of chasing the perfect split early. I’d anchor it around a pace you can hold calmly, then adjust after you’re a few miles in rather than forcing it from the gun.`,
        alternate:
          "For pacing questions, I’d usually trust controlled effort over a perfect target pace. Starting a touch conservative is almost always easier to recover from than starting too hot.",
        cta: input.appSettings.enableCTASuggestions && input.config.allowCTA && !input.config.strictNoPromo
          ? "Happy to sketch out how I’d pace that specifically if it helps."
          : ""
      };
    case "mileage":
      return {
        core: `${defaultLead} If weekly mileage is the lever you’re trying to pull, I’d bias toward consistency before adding more volume. A smaller increase you can hold for a couple of weeks is usually more useful than a quick jump that leaves you flat or banged up.`,
        alternate:
          "Mileage questions are usually less about the perfect number and more about whether you can absorb it. I’d rather see a boring, repeatable week than one big spike.",
        cta: ""
      };
    case "race":
      return {
        core: `${defaultLead} For race-prep questions, I’d focus on not trying to prove fitness in one session. Keep the long-run and key workout structure honest, then show up fresher instead of squeezing in extra work late.`,
        alternate:
          "If the goal race is the main context, I’d simplify the decision around what gives you the best chance to arrive consistent and fresh. Most mistakes here come from forcing extra fitness too close to race day.",
        cta: ""
      };
    case "form":
      return {
        core: `${defaultLead} For cadence or form questions, I’d avoid forcing a mechanical change all at once. A small cue you can keep during easy running is usually more sustainable than trying to overhaul everything in one go.`,
        alternate:
          "With form questions, I’d think in terms of small adjustments that make running feel smoother, not more scripted. If a cue creates tension, it’s probably too much.",
        cta: ""
      };
    case "recovery":
      return {
        core: `${defaultLead} If recovery is the issue, I’d make the next few days easier before making them harder. Getting one more session in rarely helps if you’re already carrying fatigue you haven’t absorbed.`,
        alternate:
          "Recovery questions usually come down to whether you need another workout or just a better chance to absorb the work you already did. I’d lean toward the second one first.",
        cta: ""
      };
    case "beginner":
      return {
        core: `${defaultLead} If you’re newer to running, I’d simplify the plan around easy consistency first. A lot of beginner progress comes from stringing together unglamorous weeks instead of trying to optimize every run immediately.`,
        alternate:
          "For a newer runner, I’d keep the language simple: easier than you think, steadier than you think, and patient longer than you think. That solves a surprising number of problems early on.",
        cta: ""
      };
    case "trail":
      return {
        core: `${defaultLead} On trail-specific questions, I’d be careful about comparing effort directly to road pace. Terrain and elevation change the equation, so effort control usually matters more than the pace number itself.`,
        alternate:
          "Trail questions usually make more sense if you frame them around effort, climbing cost, and footing instead of raw pace. I’d judge the run by how controlled it felt, not what the watch says.",
        cta: ""
      };
    case "workout":
      return {
        core: `${defaultLead} If the question is about workouts, I’d keep the purpose of the session narrow and stop trying to turn one workout into three. The best workout is the one that fits the rest of your week and leaves you able to train again.`,
        alternate:
          "Workout questions usually improve once you ask what that session is supposed to develop. If the answer is unclear, the session is probably doing too much.",
        cta: ""
      };
    default:
      return {
        core: `${defaultLead} Based on what you wrote, I’d look for the simplest change that improves consistency before chasing a more aggressive fix. Most running questions get better when the next week is a little more controlled and a little less reactive.`,
        alternate:
          "I’d simplify it: pick the lowest-drama adjustment that gives you cleaner feedback over the next few runs, then build from there instead of trying to solve the whole thing at once.",
        cta: ""
      };
  }
}

function buildFallbackDraft(input: GenerateDraftInput, reason?: string): DraftGenerationResult {
  const allowCTA =
    input.appSettings.enableCTASuggestions &&
    input.config.allowCTA &&
    !input.config.strictNoPromo;
  const topicSpecific = buildTopicSpecificFallback(input);
  const fallbackReason = reason ? truncate(reason, 220) : "No model response was available.";

  return {
    coreReply: topicSpecific.core,
    alternateReply: topicSpecific.alternate,
    optionalCTA: allowCTA ? topicSpecific.cta : "",
    confidence: 0.58,
    reasoning: `Fallback draft used because the OpenAI draft request was unavailable. ${fallbackReason}`,
    modelName: "fallback-template"
  };
}

export async function generateDraft(input: GenerateDraftInput): Promise<DraftGenerationResult> {
  const allowCTA =
    input.appSettings.enableCTASuggestions &&
    input.config.allowCTA &&
    !input.config.strictNoPromo;

  const recentOpenings = input.recentDrafts
    .map((draft) => draft.openingLine || extractFirstLine(draft.draftText))
    .filter(Boolean)
    .slice(0, 10);

  const systemPrompt = [
    "You draft Reddit replies for Johnny Crain at RunFitCoach.",
    "Output JSON only with coreReply, alternateReply, optionalCTA, confidence, reasoning.",
    "Voice: knowledgeable, practical, direct, conversational, grounded, not robotic, not salesy.",
    "Helpful first. Default to no CTA unless it is truly natural and subtle.",
    "Do not diagnose or act medically certain.",
    "Avoid repetitive openings and avoid hard-selling coaching.",
    input.ruleContext?.defaultReplyStyle
      ? `Follow this subreddit's preferred style: ${input.ruleContext.defaultReplyStyle}.`
      : "",
    input.ruleContext?.styleHints.length
      ? `Additional style hints: ${input.ruleContext.styleHints.join(" | ")}.`
      : "",
    input.config.advancedTone
      ? "This subreddit is more advanced. Use slightly more training-literate language."
      : "Keep language accessible and clear.",
    allowCTA
      ? `A subtle CTA is allowed, but it should often be blank.${
          input.ruleContext?.ctaStyleHints.length
            ? ` If used, prefer this style: ${input.ruleContext.ctaStyleHints.join(" | ")}.`
            : ""
        }`
      : "optionalCTA must be blank."
  ]
    .filter(Boolean)
    .join(" ");

  const userPrompt = [
    JSON.stringify({
      subreddit: input.post.subreddit,
      title: input.post.title,
      body: truncate(input.post.selftext || "", 2_400),
      metadata: {
        upvotes: input.post.score,
        comments: input.post.numComments,
        isAdvancedTone: input.config.advancedTone,
        maxReplyLength: input.config.maxReplyLength,
        toneVariant: input.toneVariant ?? "default"
      },
      recentOpenings,
      subredditNotes: input.config.notes ?? "",
      voiceExamples: buildVoiceContext(input.voiceExamples),
      ruleHints: input.ruleContext
        ? {
            defaultReplyStyle: input.ruleContext.defaultReplyStyle,
            styleHints: input.ruleContext.styleHints,
            ctaStyleHints: input.ruleContext.ctaStyleHints,
            avoidPhrases: input.ruleContext.bannedPhrases.slice(0, 12)
          }
        : null
    }),
    "Return concise replies. Keep most replies to concise or medium length.",
    "If the post includes injury or medical uncertainty, stay cautious and point toward professional care for red flags.",
    "Never use repetitive opening lines from the recentOpenings list."
  ].join("\n\n");

  try {
    const response = await createStructuredCompletion<DraftModelResponse>({
      systemPrompt,
      userPrompt,
      temperature: input.toneVariant === "alternate" ? 0.7 : 0.45
    });

    if (!response?.coreReply) {
      return buildFallbackDraft(input, "The model response was empty or missing the expected fields.");
    }

    return {
      coreReply: normalizeWhitespace(response.coreReply),
      alternateReply: normalizeWhitespace(response.alternateReply || response.coreReply),
      optionalCTA: allowCTA ? normalizeWhitespace(response.optionalCTA || "") : "",
      confidence:
        typeof response.confidence === "number"
          ? Math.max(0, Math.min(1, response.confidence))
          : 0.65,
      reasoning: normalizeWhitespace(response.reasoning || "Generated by OpenAI."),
      modelName: getEnv().OPENAI_MODEL
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OpenAI error.";
    console.error("Draft generation fell back to the local template:", message);
    return buildFallbackDraft(input, message);
  }
}

export { DEFAULT_PROMPT_VERSIONS };
