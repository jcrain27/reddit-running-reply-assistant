import type { SubredditConfig, SubredditRule } from "@prisma/client";

import type { RedditPost } from "@/lib/types";
import { normalizeWhitespace } from "@/lib/utils";

export type RuleBackedSubredditConfig = SubredditConfig & {
  rules: SubredditRule[];
};

export interface EffectiveSubredditSettings {
  config: RuleBackedSubredditConfig;
  bannedPhrases: string[];
  medicalRiskKeywords: string[];
  skipKeywords: string[];
  requiredKeywords: string[];
  adviceBoostKeywords: string[];
  relevanceKeywords: string[];
  styleHints: string[];
  ctaStyleHints: string[];
  defaultReplyStyle: string | null;
}

function dedupe(values: string[]) {
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function normalizeRuleType(value: string) {
  return value.toLowerCase().trim().replace(/[\s-]+/g, "_");
}

export function buildEffectiveSubredditSettings(input: {
  config: RuleBackedSubredditConfig;
  appSettings: {
    bannedPhrases: string[];
    medicalRiskKeywords: string[];
  };
}): EffectiveSubredditSettings {
  const effective: EffectiveSubredditSettings = {
    config: input.config,
    bannedPhrases: [...input.appSettings.bannedPhrases],
    medicalRiskKeywords: [...input.appSettings.medicalRiskKeywords],
    skipKeywords: [],
    requiredKeywords: [],
    adviceBoostKeywords: [],
    relevanceKeywords: [],
    styleHints: [],
    ctaStyleHints: [],
    defaultReplyStyle: null
  };

  for (const rule of input.config.rules) {
    const type = normalizeRuleType(rule.ruleType);
    const value = normalizeWhitespace(rule.ruleValue);
    if (!value) {
      continue;
    }

    switch (type) {
      case "banned_phrase":
      case "banned_phrases":
        effective.bannedPhrases.push(value);
        break;
      case "medical_keyword":
      case "medical_risk_keyword":
        effective.medicalRiskKeywords.push(value);
        break;
      case "skip_keyword":
      case "ignore_keyword":
        effective.skipKeywords.push(value.toLowerCase());
        break;
      case "required_keyword":
      case "must_include_keyword":
        effective.requiredKeywords.push(value.toLowerCase());
        break;
      case "advice_boost_keyword":
      case "advice_keyword":
        effective.adviceBoostKeywords.push(value.toLowerCase());
        break;
      case "relevance_keyword":
      case "expertise_keyword":
        effective.relevanceKeywords.push(value.toLowerCase());
        break;
      case "style_hint":
        effective.styleHints.push(value);
        break;
      case "cta_style":
      case "soft_cta_style":
        effective.ctaStyleHints.push(value);
        break;
      case "default_reply_style":
      case "reply_style":
        effective.defaultReplyStyle = value;
        break;
      default:
        break;
    }
  }

  effective.bannedPhrases = dedupe(effective.bannedPhrases);
  effective.medicalRiskKeywords = dedupe(effective.medicalRiskKeywords);
  effective.skipKeywords = dedupe(effective.skipKeywords);
  effective.requiredKeywords = dedupe(effective.requiredKeywords);
  effective.adviceBoostKeywords = dedupe(effective.adviceBoostKeywords);
  effective.relevanceKeywords = dedupe(effective.relevanceKeywords);
  effective.styleHints = dedupe(effective.styleHints);
  effective.ctaStyleHints = dedupe(effective.ctaStyleHints);

  return effective;
}

export function findRuleSkipReasonForPost(
  post: Pick<RedditPost, "title" | "selftext">,
  settings: EffectiveSubredditSettings
) {
  const combinedText = normalizeWhitespace(`${post.title} ${post.selftext}`).toLowerCase();

  for (const keyword of settings.skipKeywords) {
    if (combinedText.includes(keyword)) {
      return `Matched subreddit skip keyword "${keyword}".`;
    }
  }

  if (settings.requiredKeywords.length > 0) {
    const matchedRequiredKeyword = settings.requiredKeywords.some((keyword) =>
      combinedText.includes(keyword)
    );

    if (!matchedRequiredKeyword) {
      return "Post did not match the subreddit's required keyword rules.";
    }
  }

  return null;
}

export function summarizePromptRuleHints(settings: EffectiveSubredditSettings) {
  const hints: string[] = [];

  if (settings.defaultReplyStyle) {
    hints.push(`Preferred reply style: ${settings.defaultReplyStyle}.`);
  }

  if (settings.styleHints.length > 0) {
    hints.push(`Style hints: ${settings.styleHints.join(" | ")}.`);
  }

  if (settings.ctaStyleHints.length > 0) {
    hints.push(`CTA style hints: ${settings.ctaStyleHints.join(" | ")}.`);
  }

  return hints;
}
