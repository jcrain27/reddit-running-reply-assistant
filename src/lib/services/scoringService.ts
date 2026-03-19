import type { SubredditConfig } from "@prisma/client";

import {
  ADVICE_INTENT_PHRASES,
  EXPERTISE_KEYWORDS,
  PROMO_RISK_PHRASES
} from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { createStructuredCompletion, getScoringModel } from "@/lib/services/openaiClient";
import type { RedditPost, ScoreBreakdown } from "@/lib/types";
import { clamp, normalizeWhitespace } from "@/lib/utils";

function countPhraseHits(text: string, phrases: readonly string[]): number {
  return phrases.reduce((count, phrase) => count + Number(text.includes(phrase)), 0);
}

function calculateAdviceScore(text: string): number {
  const lowered = text.toLowerCase();
  let score = 20;
  score += countPhraseHits(lowered, ADVICE_INTENT_PHRASES) * 8;
  score += /\?$/.test(lowered) ? 10 : 0;
  score += /\b(should|how|what|why|can)\b/.test(lowered) ? 12 : 0;
  score += /\b(help|advice|tips|feedback|thoughts)\b/.test(lowered) ? 20 : 0;
  return clamp(score, 0, 100);
}

function calculateAdviceScoreWithBoosts(text: string, boosts: string[]): number {
  return clamp(calculateAdviceScore(text) + countPhraseHits(text.toLowerCase(), boosts) * 7, 0, 100);
}

function calculateRelevanceScore(text: string, subreddit: string, boosts: string[]): number {
  const lowered = text.toLowerCase();
  let score = 35;
  score += countPhraseHits(lowered, EXPERTISE_KEYWORDS) * 7;
  score += countPhraseHits(lowered, boosts) * 7;
  score += subreddit === "advancedrunning" ? 8 : 0;
  score += /\b(beginner|new runner|first marathon)\b/.test(lowered) ? 8 : 0;
  return clamp(score, 0, 100);
}

function calculateEngagementScore(post: RedditPost, maxPostAgeHours: number): number {
  const ageHours = (Date.now() - post.createdUtc * 1000) / 3_600_000;
  const freshness = clamp(100 - (ageHours / maxPostAgeHours) * 100, 0, 100);
  const interaction = clamp(post.numComments * 4 + post.score * 1.5, 0, 100);
  return clamp(Math.round(freshness * 0.65 + interaction * 0.35), 0, 100);
}

function calculatePromoRisk(text: string, config: SubredditConfig): number {
  const lowered = text.toLowerCase();
  let score = config.strictNoPromo ? 55 : 20;
  score += countPhraseHits(lowered, PROMO_RISK_PHRASES) * 6;
  score += /\b(dm|website|link in bio|coaching|buy|business)\b/.test(lowered) ? 15 : 0;
  return clamp(score, 0, 100);
}

function calculateMedicalRisk(text: string, medicalRiskKeywords: string[]): number {
  const lowered = text.toLowerCase();
  let score = 0;
  for (const keyword of medicalRiskKeywords) {
    if (lowered.includes(keyword.toLowerCase())) {
      score += 22;
    }
  }

  score += /\b(injury|pain|swelling|doctor|physio|x-ray|mri)\b/.test(lowered) ? 15 : 0;
  score += /\b(chest pain|faint|fainted|fainting|passed out|passing out)\b/.test(lowered)
    ? 40
    : 0;
  score += /\b(stress fracture|fracture|can't bear weight|can’t bear weight)\b/.test(lowered)
    ? 35
    : 0;
  score += /\b(red-s|suicidal|medication)\b/.test(lowered) ? 35 : 0;
  score += /\b(can't walk|can’t walk|numbness|blood|collapsed)\b/.test(lowered) ? 35 : 0;
  return clamp(score, 0, 100);
}

function buildSelectedReason(
  scores: Omit<ScoreBreakdown, "selectedReason">,
  preferenceAdjustment = 0
): string {
  const reasons: string[] = [];

  if (scores.adviceScore >= 75) {
    reasons.push("The post is clearly asking for actionable advice.");
  }

  if (scores.relevanceScore >= 70) {
    reasons.push("It fits Johnny's running-training expertise.");
  }

  if (scores.engagementScore >= 65) {
    reasons.push("It is recent enough to be worth a timely reply.");
  }

  if (scores.medicalRiskScore >= 50) {
    reasons.push("Medical risk is elevated, so the draft should stay cautious.");
  }

  if (preferenceAdjustment >= 4) {
    reasons.push("You have been asking for more threads like this recently, so it received a small ranking boost.");
  }

  if (preferenceAdjustment <= -4) {
    reasons.push("You have been deprioritizing threads like this recently, so it received a small ranking penalty.");
  }

  if (!reasons.length) {
    reasons.push("It looks like a relevant coaching-style question with room for a helpful reply.");
  }

  return reasons.join(" ");
}

async function maybeModelAssistScore(input: {
  post: RedditPost;
  heuristic: ScoreBreakdown;
}): Promise<Partial<ScoreBreakdown> | null> {
  const enabled = process.env.ENABLE_MODEL_SCORING === "true";
  if (!enabled) {
    return null;
  }

  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  return createStructuredCompletion<Partial<ScoreBreakdown>>({
    model: getScoringModel(),
    temperature: 0.1,
    systemPrompt: [
      "You are scoring Reddit posts for a human-in-the-loop running advice assistant.",
      "Return JSON only with numeric fields adviceScore, relevanceScore, promoRiskScore, medicalRiskScore, priorityScore and string field selectedReason.",
      "Scores are 0-100. Be conservative about promotion and medical certainty."
    ].join(" "),
    userPrompt: JSON.stringify({
      title: input.post.title,
      body: input.post.selftext,
      subreddit: input.post.subreddit,
      heuristic: input.heuristic
    })
  });
}

export async function scorePostCandidate(params: {
  post: RedditPost;
  config: SubredditConfig;
  appSettings: {
    maxPostAgeHours: number;
    minAdviceScore: number;
    notificationThreshold: number;
    medicalRiskKeywords: string[];
    adviceBoostKeywords?: string[];
    relevanceBoostKeywords?: string[];
    preferenceAdjustment?: number;
  };
}): Promise<ScoreBreakdown> {
  const { post, config, appSettings } = params;
  const combinedText = normalizeWhitespace(`${post.title} ${post.selftext}`);
  const ageHours = (Date.now() - post.createdUtc * 1000) / 3_600_000;
  const maxPostAgeHours = Math.min(Math.max(appSettings.maxPostAgeHours, 1), 24);
  const preferenceAdjustment = clamp(appSettings.preferenceAdjustment ?? 0, -15, 15);

  const heuristic: ScoreBreakdown = {
    adviceScore: calculateAdviceScoreWithBoosts(
      combinedText,
      appSettings.adviceBoostKeywords ?? []
    ),
    relevanceScore: calculateRelevanceScore(
      combinedText,
      config.name,
      appSettings.relevanceBoostKeywords ?? []
    ),
    engagementScore: calculateEngagementScore(post, maxPostAgeHours),
    promoRiskScore: calculatePromoRisk(combinedText, config),
    medicalRiskScore: calculateMedicalRisk(
      combinedText,
      appSettings.medicalRiskKeywords
    ),
    priorityScore: 0,
    selectedReason: "",
    shouldDraft: false,
    priority: "LOW"
  };

  heuristic.priorityScore = clamp(
    Math.round(
      heuristic.adviceScore * 0.36 +
        heuristic.relevanceScore * 0.24 +
        heuristic.engagementScore * 0.2 +
        (100 - heuristic.promoRiskScore) * 0.1 +
        (100 - heuristic.medicalRiskScore) * 0.1 +
        preferenceAdjustment
    ),
    0,
    100
  );

  const modelAssist = await maybeModelAssistScore({ post, heuristic });
  const score: ScoreBreakdown = {
    ...heuristic,
    ...modelAssist
  };

  score.selectedReason = buildSelectedReason(score, preferenceAdjustment);
  score.shouldDraft =
    !post.removedByCategory &&
    post.author !== "[deleted]" &&
    ageHours <= maxPostAgeHours &&
    score.adviceScore >= Math.max(config.minAdviceScore, appSettings.minAdviceScore) &&
    score.medicalRiskScore < config.medicalCautionStrictness;

  score.priority =
    score.priorityScore >= appSettings.notificationThreshold
      ? "HIGH"
      : score.priorityScore >= 60
        ? "NORMAL"
        : "LOW";

  return score;
}
