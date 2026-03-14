import { describe, expect, it } from "vitest";

import { validateDraft } from "@/lib/services/safetyService";

describe("validateDraft", () => {
  it("flags banned promotional and medically-certain language", () => {
    const result = validateDraft({
      draftText:
        "Coach here. You definitely have a stress fracture, so DM me for coaching and I can help.",
      optionalCTA: "DM me for coaching",
      recentDrafts: [],
      bannedPhrases: ["DM me for coaching"],
      maxReplyLength: 900
    });

    expect(result.approved).toBe(false);
    expect(result.warnings.join(" ")).toContain("banned phrase");
    expect(result.warnings.join(" ")).toContain("medically certain");
  });

  it("flags drafts that repeat a recent opening", () => {
    const result = validateDraft({
      draftText:
        "I’d keep this simple. Back off the intensity for a few days and see how your legs respond.",
      optionalCTA: "",
      recentDrafts: [
        {
          draftText:
            "I’d keep this simple. Focus on easy mileage for a week before adding anything hard.",
          openingLine: "I’d keep this simple."
        }
      ],
      bannedPhrases: [],
      maxReplyLength: 900
    });

    expect(result.approved).toBe(false);
    expect(result.duplicateRiskScore).toBeGreaterThanOrEqual(75);
  });

  it("flags repeated CTA phrasing across recent drafts", () => {
    const result = validateDraft({
      draftText:
        "I’d keep the next week simple: back off the harder sessions and rebuild from easy mileage.",
      optionalCTA: "Happy to elaborate if it helps.",
      recentDrafts: [
        {
          draftText:
            "I’d keep the next two weeks straightforward and avoid forcing the workouts.",
          optionalCTAText: "Happy to elaborate if it helps."
        }
      ],
      bannedPhrases: [],
      maxReplyLength: 900
    });

    expect(result.warnings.join(" ")).toContain("CTA phrasing");
  });
});
