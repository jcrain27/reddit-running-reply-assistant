import { describe, expect, it } from "vitest";

import type { SubredditConfig, SubredditRule } from "@prisma/client";

import {
  buildEffectiveSubredditSettings,
  findRuleSkipReasonForPost
} from "@/lib/services/subredditRulesService";

function makeConfig(rules: SubredditRule[]) {
  return {
    id: "sub_1",
    name: "advancedrunning",
    enabled: true,
    allowDirectSubmit: false,
    allowCTA: false,
    strictNoPromo: true,
    maxRepliesPerDay: 2,
    minAdviceScore: 60,
    maxReplyLength: 700,
    advancedTone: true,
    medicalCautionStrictness: 65,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    rules
  } satisfies SubredditConfig & { rules: SubredditRule[] };
}

function makeRule(ruleType: string, ruleValue: string): SubredditRule {
  return {
    id: `${ruleType}-${ruleValue}`,
    subredditConfigId: "sub_1",
    ruleType,
    ruleValue,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe("subredditRulesService", () => {
  it("merges stored rules into effective runtime settings", () => {
    const effective = buildEffectiveSubredditSettings({
      config: makeConfig([
        makeRule("banned_phrase", "coach here"),
        makeRule("medical_keyword", "stress reaction"),
        makeRule("style_hint", "Assume the reader understands lactate threshold."),
        makeRule("default_reply_style", "training-literate and concise")
      ]),
      appSettings: {
        bannedPhrases: ["DM me for coaching"],
        medicalRiskKeywords: ["chest pain"]
      }
    });

    expect(effective.bannedPhrases).toContain("coach here");
    expect(effective.bannedPhrases).toContain("DM me for coaching");
    expect(effective.medicalRiskKeywords).toContain("stress reaction");
    expect(effective.defaultReplyStyle).toBe("training-literate and concise");
    expect(effective.styleHints[0]).toContain("lactate threshold");
  });

  it("skips posts that match skip keyword rules", () => {
    const effective = buildEffectiveSubredditSettings({
      config: makeConfig([makeRule("skip_keyword", "gear deal")]),
      appSettings: {
        bannedPhrases: [],
        medicalRiskKeywords: []
      }
    });

    const reason = findRuleSkipReasonForPost(
      {
        title: "Best gear deal this week?",
        selftext: "Looking for a shoe sale."
      },
      effective
    );

    expect(reason).toContain("skip keyword");
  });
});
