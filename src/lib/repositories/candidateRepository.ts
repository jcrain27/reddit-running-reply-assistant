import { CandidateStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

export async function listCandidates(status?: CandidateStatus) {
  return prisma.postCandidate.findMany({
    where: status ? { status } : undefined,
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
