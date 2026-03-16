import { Prisma } from "@prisma/client";

import {
  CANDIDATE_STATUSES,
  DEFAULT_BANNED_PHRASES,
  DEFAULT_MEDICAL_RISK_KEYWORDS,
  DEFAULT_SUBREDDITS
} from "@/lib/constants";
import { prisma } from "@/lib/db";

export interface SaveSettingsInput {
  appSettings: {
    scanFrequencyMinutes: number;
    maxPostAgeHours: number;
    minAdviceScore: number;
    notificationThreshold: number;
    enableDirectSubmit: boolean;
    enableCTASuggestions: boolean;
    maxSuggestedRepliesPerDay: number;
    notificationEmailEnabled: boolean;
    notificationSlackEnabled: boolean;
    notificationEmailTo?: string | null;
    notificationSlackWebhookUrl?: string | null;
    bannedPhrases: string[];
    medicalRiskKeywords: string[];
  };
  subreddits: Array<{
    name: string;
    enabled: boolean;
    allowDirectSubmit: boolean;
    allowCTA: boolean;
    strictNoPromo: boolean;
    maxRepliesPerDay: number;
    minAdviceScore: number;
    maxReplyLength: number;
    advancedTone: boolean;
    medicalCautionStrictness: number;
    notes?: string | null;
  }>;
  subredditRules: Array<{
    subreddit: string;
    ruleType: string;
    ruleValue: string;
  }>;
}

export interface VoiceExampleInput {
  label: string;
  sourceType: string;
  content: string;
  enabled: boolean;
}

function clampMaxPostAgeHours(value: number) {
  return Math.min(Math.max(value, 1), 24);
}

function toStringArray(value: Prisma.JsonValue | null | undefined, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry : ""))
    .filter(Boolean);
}

export async function getAppSettings() {
  const existing = await prisma.appSettings.findUnique({
    where: { id: "app" }
  });

  if (existing) {
    return {
      ...existing,
      maxPostAgeHours: clampMaxPostAgeHours(existing.maxPostAgeHours),
      bannedPhrases: toStringArray(existing.bannedPhrases, DEFAULT_BANNED_PHRASES),
      medicalRiskKeywords: toStringArray(
        existing.medicalRiskKeywords,
        DEFAULT_MEDICAL_RISK_KEYWORDS
      ),
      candidateStatuses: toStringArray(existing.candidateStatuses, [...CANDIDATE_STATUSES])
    };
  }

  return prisma.appSettings.create({
    data: {
      id: "app",
      bannedPhrases: DEFAULT_BANNED_PHRASES as Prisma.InputJsonValue,
      medicalRiskKeywords: DEFAULT_MEDICAL_RISK_KEYWORDS as Prisma.InputJsonValue,
      candidateStatuses: CANDIDATE_STATUSES as unknown as Prisma.InputJsonValue
    }
  });
}

export async function getEnabledSubredditConfigs() {
  const configs = await prisma.subredditConfig.findMany({
    where: { enabled: true },
    include: {
      rules: true
    },
    orderBy: { name: "asc" }
  });

  if (configs.length > 0) {
    return configs;
  }

  for (const name of DEFAULT_SUBREDDITS) {
    await prisma.subredditConfig.create({
      data: { name }
    });
  }

  return prisma.subredditConfig.findMany({
    where: { enabled: true },
    include: { rules: true },
    orderBy: { name: "asc" }
  });
}

export async function getSettingsPageData() {
  const [appSettings, subreddits, voiceExamples] = await Promise.all([
    getAppSettings(),
    prisma.subredditConfig.findMany({
      include: { rules: true },
      orderBy: { name: "asc" }
    }),
    prisma.voiceExample.findMany({
      orderBy: [{ enabled: "desc" }, { label: "asc" }]
    })
  ]);

  return { appSettings, subreddits, voiceExamples };
}

export async function saveSettings(input: SaveSettingsInput) {
  const desiredNames = new Set(input.subreddits.map((entry) => entry.name.toLowerCase().trim()));

  await prisma.$transaction(async (tx) => {
    await tx.appSettings.upsert({
      where: { id: "app" },
      update: {
        scanFrequencyMinutes: input.appSettings.scanFrequencyMinutes,
        maxPostAgeHours: clampMaxPostAgeHours(input.appSettings.maxPostAgeHours),
        minAdviceScore: input.appSettings.minAdviceScore,
        notificationThreshold: input.appSettings.notificationThreshold,
        enableDirectSubmit: input.appSettings.enableDirectSubmit,
        enableCTASuggestions: input.appSettings.enableCTASuggestions,
        maxSuggestedRepliesPerDay: input.appSettings.maxSuggestedRepliesPerDay,
        notificationEmailEnabled: input.appSettings.notificationEmailEnabled,
        notificationSlackEnabled: input.appSettings.notificationSlackEnabled,
        notificationEmailTo: input.appSettings.notificationEmailTo || null,
        notificationSlackWebhookUrl:
          input.appSettings.notificationSlackWebhookUrl || null,
        bannedPhrases: input.appSettings.bannedPhrases as Prisma.InputJsonValue,
        medicalRiskKeywords: input.appSettings.medicalRiskKeywords as Prisma.InputJsonValue,
        candidateStatuses: CANDIDATE_STATUSES as unknown as Prisma.InputJsonValue
      },
      create: {
        id: "app",
        scanFrequencyMinutes: input.appSettings.scanFrequencyMinutes,
        maxPostAgeHours: clampMaxPostAgeHours(input.appSettings.maxPostAgeHours),
        minAdviceScore: input.appSettings.minAdviceScore,
        notificationThreshold: input.appSettings.notificationThreshold,
        enableDirectSubmit: input.appSettings.enableDirectSubmit,
        enableCTASuggestions: input.appSettings.enableCTASuggestions,
        maxSuggestedRepliesPerDay: input.appSettings.maxSuggestedRepliesPerDay,
        notificationEmailEnabled: input.appSettings.notificationEmailEnabled,
        notificationSlackEnabled: input.appSettings.notificationSlackEnabled,
        notificationEmailTo: input.appSettings.notificationEmailTo || null,
        notificationSlackWebhookUrl:
          input.appSettings.notificationSlackWebhookUrl || null,
        bannedPhrases: input.appSettings.bannedPhrases as Prisma.InputJsonValue,
        medicalRiskKeywords: input.appSettings.medicalRiskKeywords as Prisma.InputJsonValue,
        candidateStatuses: CANDIDATE_STATUSES as unknown as Prisma.InputJsonValue
      }
    });

    const existingConfigs = await tx.subredditConfig.findMany({
      select: { id: true, name: true }
    });

    for (const entry of input.subreddits) {
      const name = entry.name.toLowerCase().trim();
      await tx.subredditConfig.upsert({
        where: { name },
        update: {
          enabled: entry.enabled,
          allowDirectSubmit: entry.allowDirectSubmit,
          allowCTA: entry.allowCTA,
          strictNoPromo: entry.strictNoPromo,
          maxRepliesPerDay: entry.maxRepliesPerDay,
          minAdviceScore: entry.minAdviceScore,
          maxReplyLength: entry.maxReplyLength,
          advancedTone: entry.advancedTone,
          medicalCautionStrictness: entry.medicalCautionStrictness,
          notes: entry.notes || null
        },
        create: {
          name,
          enabled: entry.enabled,
          allowDirectSubmit: entry.allowDirectSubmit,
          allowCTA: entry.allowCTA,
          strictNoPromo: entry.strictNoPromo,
          maxRepliesPerDay: entry.maxRepliesPerDay,
          minAdviceScore: entry.minAdviceScore,
          maxReplyLength: entry.maxReplyLength,
          advancedTone: entry.advancedTone,
          medicalCautionStrictness: entry.medicalCautionStrictness,
          notes: entry.notes || null
        }
      });
    }

    const toDisable = existingConfigs.filter((config) => !desiredNames.has(config.name));
    for (const config of toDisable) {
      await tx.subredditConfig.update({
        where: { id: config.id },
        data: { enabled: false }
      });
    }

    await tx.subredditRule.deleteMany({});

    for (const rule of input.subredditRules) {
      const subreddit = rule.subreddit.toLowerCase().trim();
      if (!subreddit || !rule.ruleType || !rule.ruleValue) {
        continue;
      }

      const config = await tx.subredditConfig.findUnique({
        where: { name: subreddit },
        select: { id: true }
      });

      if (!config) {
        continue;
      }

      await tx.subredditRule.create({
        data: {
          subredditConfigId: config.id,
          ruleType: rule.ruleType.trim(),
          ruleValue: rule.ruleValue.trim()
        }
      });
    }
  });
}

export async function saveVoiceExamples(voiceExamples: VoiceExampleInput[]) {
  await prisma.$transaction(async (tx) => {
    await tx.voiceExample.deleteMany({});

    for (const example of voiceExamples) {
      await tx.voiceExample.create({
        data: {
          label: example.label.trim(),
          sourceType: example.sourceType.trim(),
          content: example.content.trim(),
          enabled: example.enabled
        }
      });
    }
  });
}
