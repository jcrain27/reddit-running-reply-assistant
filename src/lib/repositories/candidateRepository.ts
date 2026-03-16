import { CandidateStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

const DEFAULT_RECENT_WINDOW_HOURS = 24;

function clampRecentWindow(value?: number) {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_RECENT_WINDOW_HOURS;
  }

  return Math.min(Math.max(Math.floor(value), 1), DEFAULT_RECENT_WINDOW_HOURS);
}

export async function listCandidates(options?: {
  status?: CandidateStatus;
  search?: string;
  maxAgeHours?: number;
  take?: number;
}) {
  const recentWindowHours = clampRecentWindow(options?.maxAgeHours);
  const createdAfter = new Date(Date.now() - recentWindowHours * 3_600_000);
  const search = options?.search?.trim();

  return prisma.postCandidate.findMany({
    where: {
      ...(options?.status ? { status: options.status } : {}),
      createdUtc: {
        gte: createdAfter
      },
      ...(search
        ? {
            OR: [
              {
                title: {
                  contains: search,
                  mode: "insensitive"
                }
              },
              {
                bodyText: {
                  contains: search,
                  mode: "insensitive"
                }
              },
              {
                author: {
                  contains: search,
                  mode: "insensitive"
                }
              },
              {
                subreddit: {
                  contains: search,
                  mode: "insensitive"
                }
              }
            ]
          }
        : {})
    },
    include: {
      draftReplies: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      notificationEvents: {
        orderBy: { sentAt: "desc" },
        take: 1
      },
      replySubmissions: {
        orderBy: { submittedAt: "desc" },
        take: 1
      }
    },
    take: options?.take,
    orderBy: [
      { priorityScore: "desc" },
      { createdAt: "desc" }
    ]
  });
}

export async function getCandidateDetail(id: string) {
  return prisma.postCandidate.findUnique({
    where: { id },
    include: {
      trackedComments: {
        orderBy: { createdAt: "desc" }
      },
      draftReplies: {
        orderBy: { createdAt: "desc" }
      },
      notificationEvents: {
        orderBy: { sentAt: "desc" }
      },
      replySubmissions: {
        orderBy: { submittedAt: "desc" }
      }
    }
  });
}

export async function getLatestDraft(id: string) {
  return prisma.draftReply.findFirst({
    where: { postCandidateId: id },
    orderBy: { createdAt: "desc" }
  });
}
