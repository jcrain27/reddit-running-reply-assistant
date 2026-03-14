import {
  MAX_RECENT_DRAFTS_FOR_SIMILARITY,
  MEDICAL_CERTAINTY_PHRASES,
  PROMO_RISK_PHRASES
} from "@/lib/constants";
import type { SafetyValidationResult } from "@/lib/types";
import {
  calculateTextSimilarity,
  clamp,
  extractFirstSentence,
  extractFirstLine,
  normalizeWhitespace
} from "@/lib/utils";

interface ValidateDraftInput {
  draftText: string;
  optionalCTA: string;
  recentDrafts: Array<{
    draftText: string;
    optionalCTAText?: string | null;
    openingLine?: string | null;
  }>;
  bannedPhrases: string[];
  maxReplyLength: number;
}

export function validateDraft(input: ValidateDraftInput): SafetyValidationResult {
  const warnings: string[] = [];
  const normalizedDraft = normalizeWhitespace(input.draftText);
  const openingLine = extractFirstLine(input.draftText);
  const firstSentence = extractFirstSentence(input.draftText);
  const normalizedOptionalCTA = normalizeWhitespace(input.optionalCTA);
  const recentDrafts = input.recentDrafts.slice(0, MAX_RECENT_DRAFTS_FOR_SIMILARITY);

  let duplicateRiskScore = 0;
  for (const recentDraft of recentDrafts) {
    const similarity = calculateTextSimilarity(normalizedDraft, recentDraft.draftText);
    duplicateRiskScore = Math.max(duplicateRiskScore, Math.round(similarity * 100));
    duplicateRiskScore = Math.max(
      duplicateRiskScore,
      Math.round(
        calculateTextSimilarity(firstSentence, extractFirstSentence(recentDraft.draftText)) * 100
      )
    );

    if (
      recentDraft.openingLine &&
      openingLine &&
      (openingLine.toLowerCase().startsWith(recentDraft.openingLine.toLowerCase()) ||
        recentDraft.openingLine.toLowerCase().startsWith(openingLine.toLowerCase()))
    ) {
      duplicateRiskScore = Math.max(duplicateRiskScore, 90);
    }
  }

  if (duplicateRiskScore >= 75) {
    warnings.push("Draft is too similar to recent replies.");
  }

  const bannedHit = input.bannedPhrases.find((phrase) =>
    normalizedDraft.toLowerCase().includes(phrase.toLowerCase())
  );
  if (bannedHit) {
    warnings.push(`Draft contains a banned phrase: "${bannedHit}"`);
  }

  let promotionalRiskScore = 0;
  for (const phrase of PROMO_RISK_PHRASES) {
    if (normalizedDraft.toLowerCase().includes(phrase.toLowerCase())) {
      promotionalRiskScore += 12;
    }
  }

  if (/\b(dm me|website|buy|check out|limited spots)\b/i.test(normalizedDraft)) {
    promotionalRiskScore += 40;
  }

  if (input.optionalCTA && calculateTextSimilarity(input.optionalCTA, normalizedDraft) > 0.4) {
    promotionalRiskScore += 10;
  }

  if (normalizedOptionalCTA) {
    for (const recentDraft of recentDrafts) {
      const recentCTA = normalizeWhitespace(recentDraft.optionalCTAText ?? "");
      if (!recentCTA) {
        continue;
      }

      const ctaSimilarity = calculateTextSimilarity(normalizedOptionalCTA, recentCTA);
      if (ctaSimilarity >= 0.75) {
        promotionalRiskScore += 15;
        duplicateRiskScore = Math.max(duplicateRiskScore, 70);
      }
    }
  }

  promotionalRiskScore = clamp(promotionalRiskScore, 0, 100);
  if (promotionalRiskScore >= 60) {
    warnings.push("Draft sounds too promotional.");
  }

  if (normalizedOptionalCTA && duplicateRiskScore >= 70) {
    warnings.push("Optional CTA phrasing is too similar to recent drafts.");
  }

  let medicalCertaintyRiskScore = 0;
  for (const phrase of MEDICAL_CERTAINTY_PHRASES) {
    if (normalizedDraft.toLowerCase().includes(phrase.toLowerCase())) {
      medicalCertaintyRiskScore += 35;
    }
  }

  if (/\byou have\b/i.test(normalizedDraft) && /\bfracture|injury|condition|tear\b/i.test(normalizedDraft)) {
    medicalCertaintyRiskScore += 35;
  }

  medicalCertaintyRiskScore = clamp(medicalCertaintyRiskScore, 0, 100);
  if (medicalCertaintyRiskScore >= 35) {
    warnings.push("Draft sounds too medically certain.");
  }

  if (normalizedDraft.length > input.maxReplyLength) {
    warnings.push("Draft is longer than the subreddit's preferred style.");
  }

  const approved =
    duplicateRiskScore < 75 &&
    promotionalRiskScore < 60 &&
    medicalCertaintyRiskScore < 35 &&
    normalizedDraft.length <= input.maxReplyLength;

  return {
    approved,
    warnings,
    duplicateRiskScore,
    promotionalRiskScore,
    medicalCertaintyRiskScore,
    openingLine
  };
}
