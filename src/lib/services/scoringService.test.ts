import { describe, expect, it } from "vitest";

import type { SubredditConfig } from "@prisma/client";

import { scorePostCandidate } from "@/lib/services/scoringService";

function makeConfig(overrides: Partial<SubredditConfig> = {}): SubredditConfig {
  return {
    id: "sub_1",
    name: "running",
    enabled: true,
    allowDirectSubmit: false,
    allowCTA: false,
    strictNoPromo: true,
    maxRepliesPerDay: 2,
    minAdviceScore: 60,
    maxReplyLength: 900,
    advancedTone: false,
    medicalCautionStrictness: 70,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

describe("scorePostCandidate", () => {
  it("selects a fresh advice-seeking training post", async () => {
    const result = await scorePostCandidate({
      post: {
        id: "abc123",
        name: "t3_abc123",
        subreddit: "running",
        title: "How should I pace my first half marathon?",
        author: "runner123",
        selftext:
          "I am training for my first half and my long run pace is all over the place. What should I do for race day pacing?",
        permalink: "https://reddit.com/r/running/comments/abc123",
        url: "https://reddit.com/r/running/comments/abc123",
        createdUtc: Math.floor(Date.now() / 1000) - 60 * 60,
        score: 8,
        numComments: 4,
        isSelf: true,
        removedByCategory: null,
        over18: false
      },
      config: makeConfig(),
      appSettings: {
        maxPostAgeHours: 24,
        minAdviceScore: 60,
        notificationThreshold: 85,
        medicalRiskKeywords: ["stress fracture", "chest pain"]
      }
    });

    expect(result.adviceScore).toBeGreaterThanOrEqual(60);
    expect(result.relevanceScore).toBeGreaterThanOrEqual(60);
    expect(result.shouldDraft).toBe(true);
  });

  it("skips a high-medical-risk post", async () => {
    const result = await scorePostCandidate({
      post: {
        id: "med999",
        name: "t3_med999",
        subreddit: "running",
        title: "Chest pain after my run. Should I keep training?",
        author: "runner123",
        selftext: "I had chest pain and almost fainted after my workout. What should I do?",
        permalink: "https://reddit.com/r/running/comments/med999",
        url: "https://reddit.com/r/running/comments/med999",
        createdUtc: Math.floor(Date.now() / 1000) - 30 * 60,
        score: 12,
        numComments: 2,
        isSelf: true,
        removedByCategory: null,
        over18: false
      },
      config: makeConfig({ medicalCautionStrictness: 60 }),
      appSettings: {
        maxPostAgeHours: 24,
        minAdviceScore: 60,
        notificationThreshold: 85,
        medicalRiskKeywords: ["stress fracture", "chest pain", "fainting"]
      }
    });

    expect(result.medicalRiskScore).toBeGreaterThanOrEqual(60);
    expect(result.shouldDraft).toBe(false);
  });
});
