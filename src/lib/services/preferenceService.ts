import { PreferenceSignal } from "@prisma/client";

import { prisma } from "@/lib/db";
import { clamp } from "@/lib/utils";

const PREFERENCE_LOOKBACK_DAYS = 90;
const MAX_PREFERENCE_ADJUSTMENT = 15;

export async function saveCandidatePreference(candidateId: string, signal: PreferenceSignal) {
  const candidate = await prisma.postCandidate.findUnique({
    where: { id: candidateId },
    select: { id: true, subreddit: true }
  });

  if (!candidate) {
    throw new Error("Candidate not found.");
  }

  return prisma.candidatePreferenceFeedback.upsert({
    where: { postCandidateId: candidate.id },
    update: {
      signal,
      subreddit: candidate.subreddit
    },
    create: {
      postCandidateId: candidate.id,
      subreddit: candidate.subreddit,
      signal
    }
  });
}

export async function getSubredditPreferenceAdjustments(): Promise<Map<string, number>> {
  const cutoff = new Date(Date.now() - PREFERENCE_LOOKBACK_DAYS * 24 * 3_600_000);
  const signals = await prisma.candidatePreferenceFeedback.findMany({
    where: {
      updatedAt: {
        gte: cutoff
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      subreddit: true,
      signal: true,
      updatedAt: true
    }
  });

  const adjustments = new Map<string, number>();

  for (const entry of signals) {
    const ageDays = (Date.now() - entry.updatedAt.getTime()) / 86_400_000;
    const recencyWeight = ageDays <= 14 ? 1 : ageDays <= 45 ? 0.65 : 0.35;
    const delta = entry.signal === PreferenceSignal.MORE ? 6 : -6;
    const next = (adjustments.get(entry.subreddit) ?? 0) + delta * recencyWeight;
    adjustments.set(entry.subreddit, next);
  }

  return new Map<string, number>(
    [...adjustments.entries()]
      .map<[string, number]>(([subreddit, value]) => [
        subreddit,
        clamp(Math.round(value), -MAX_PREFERENCE_ADJUSTMENT, MAX_PREFERENCE_ADJUSTMENT)
      ])
      .filter(([, value]) => value !== 0)
  );
}

export function getPreferenceAdjustmentLabel(adjustment: number) {
  if (adjustment >= 4) {
    return "More like this";
  }

  if (adjustment <= -4) {
    return "Less like this";
  }

  return null;
}
