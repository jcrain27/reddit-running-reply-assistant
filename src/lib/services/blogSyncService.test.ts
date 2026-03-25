import { describe, expect, it } from "vitest";

import {
  buildReadMoreSuggestion,
  parseBlogFeed,
  recommendBlogPost
} from "@/lib/services/blogSyncService";

describe("parseBlogFeed", () => {
  it("extracts clean article records from the RSS feed", () => {
    const items = parseBlogFeed(`
      <rss>
        <channel>
          <item>
            <title><![CDATA[Is Your Easy Run Pace Too Fast?]]></title>
            <dc:creator><![CDATA[Johnny Crain]]></dc:creator>
            <pubDate>Thu, 20 Mar 2026 18:16:21 +0000</pubDate>
            <link>https://www.runfitcoach.com/blog/is-your-easy-run-pace-too-fast</link>
            <description><![CDATA[
              <p>Your easy run pace should feel easy enough to repeat.</p>
              <p>Slowing down helps you absorb more volume and stay fresher for workouts.</p>
            ]]></description>
          </item>
        </channel>
      </rss>
    `);

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Is Your Easy Run Pace Too Fast?");
    expect(items[0]?.author).toBe("Johnny Crain");
    expect(items[0]?.summaryText).toContain("easy run pace should feel easy enough");
    expect(items[0]?.matchKeywords).toContain("easy");
  });
});

describe("recommendBlogPost", () => {
  it("selects the best matching blog for a Reddit pacing question", () => {
    const recommendation = recommendBlogPost({
      postTitle: "How slow should my easy runs actually be?",
      postBodyText:
        "I keep hearing that my easy pace is too fast and I think that is wrecking my recovery between workouts.",
      blogPosts: [
        {
          id: "blog_1",
          title: "Is Your Easy Run Pace Too Fast?",
          url: "https://www.runfitcoach.com/blog/is-your-easy-run-pace-too-fast",
          summaryText:
            "Slow easy running helps recovery, aerobic development, and workout quality.",
          contentText:
            "Slow easy running helps recovery, aerobic development, and workout quality over the long haul.",
          publishedAt: new Date("2026-03-20T00:00:00.000Z"),
          matchKeywords: ["easy", "pace", "recovery", "aerobic"]
        },
        {
          id: "blog_2",
          title: "Strength Training for Runners",
          url: "https://www.runfitcoach.com/blog/strength-training-for-runners",
          summaryText: "How strength work supports durability and power.",
          contentText: "Strength work supports durability and power for runners.",
          publishedAt: new Date("2026-03-19T00:00:00.000Z"),
          matchKeywords: ["strength", "durability", "power"]
        }
      ]
    });

    expect(recommendation?.title).toBe("Is Your Easy Run Pace Too Fast?");
    expect(recommendation?.matchScore).toBeGreaterThan(0.18);
    expect(recommendation?.reason.toLowerCase()).toContain("overlap");
  });

  it("formats a subtle read-more suggestion", () => {
    expect(
      buildReadMoreSuggestion({
        title: "How to Avoid Running Burnout Using Recovery Data",
        url: "https://www.runfitcoach.com/blog/how-to-avoid-running-burnout-using-recovery-data"
      })
    ).toContain("If you'd want to read more");
  });
});
