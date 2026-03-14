import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAuth } from "@/lib/routeAuth";
import { saveSettings } from "@/lib/services/settingsService";

const subredditSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  allowDirectSubmit: z.boolean(),
  allowCTA: z.boolean(),
  strictNoPromo: z.boolean(),
  maxRepliesPerDay: z.number().int().min(0),
  minAdviceScore: z.number().int().min(0).max(100),
  maxReplyLength: z.number().int().min(50),
  advancedTone: z.boolean(),
  medicalCautionStrictness: z.number().int().min(0).max(100),
  notes: z.string().optional().nullable()
});

const saveSettingsSchema = z.object({
  appSettings: z.object({
    scanFrequencyMinutes: z.number().int().min(1),
    maxPostAgeHours: z.number().int().min(1),
    minAdviceScore: z.number().int().min(0).max(100),
    notificationThreshold: z.number().int().min(0).max(100),
    enableDirectSubmit: z.boolean(),
    enableCTASuggestions: z.boolean(),
    maxSuggestedRepliesPerDay: z.number().int().min(1),
    notificationEmailEnabled: z.boolean(),
    notificationSlackEnabled: z.boolean(),
    notificationEmailTo: z.string().optional().nullable(),
    notificationSlackWebhookUrl: z.string().optional().nullable(),
    bannedPhrases: z.array(z.string()),
    medicalRiskKeywords: z.array(z.string())
  }),
  subreddits: z.array(subredditSchema),
  subredditRules: z.array(
    z.object({
      subreddit: z.string(),
      ruleType: z.string(),
      ruleValue: z.string()
    })
  )
});

export async function POST(request: Request) {
  const auth = await requireRouteAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = saveSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
  }

  await saveSettings(parsed.data);
  return NextResponse.json({ ok: true });
}
