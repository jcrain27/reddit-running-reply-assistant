import { CandidateStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

export async function listCommentReplyCandidates(status?: CandidateStatus) {
  return prisma.commentReplyCandidate.findMany({
    where: status ? { status } : undefined,
    include: {
      trackedComment: true,
      draftReplies: {
        include: {
          recommendedBlogPost: true
        },
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

export async function getCommentReplyCandidateDetail(id: string) {
  return prisma.commentReplyCandidate.findUnique({
    where: { id },
    include: {
      trackedComment: true,
      trackedResponses: {
        orderBy: { createdAt: "desc" }
      },
      draftReplies: {
        include: {
          recommendedBlogPost: true
        },
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

export async function getLatestCommentReplyDraft(id: string) {
  return prisma.commentReplyDraft.findFirst({
    where: { commentReplyCandidateId: id },
    orderBy: { createdAt: "desc" }
  });
}
