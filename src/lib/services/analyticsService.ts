import { CandidateStatus, DraftFinalAction, SubmissionMode } from "@prisma/client";

import { prisma } from "@/lib/db";
import { average } from "@/lib/utils";

export async function getAnalyticsSummary() {
  const [
    scanRuns,
    totalCandidates,
    totalDrafts,
    approvedCandidates,
    skippedCandidates,
    directSubmissions,
    copyOnlySubmissions,
    draftEditDistances,
    draftConfidences,
    ctaDrafts,
    noCtaDrafts,
    candidateGroups,
    approvedGroups,
    notificationSentCount,
    notificationFailureCount,
    manualReviewCount,
    statusBreakdown,
    approvedWithCta,
    approvedWithoutCta
  ] = await Promise.all([
    prisma.scanRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    prisma.postCandidate.count(),
    prisma.draftReply.count(),
    prisma.postCandidate.count({
      where: {
        status: {
          in: [CandidateStatus.APPROVED, CandidateStatus.SUBMITTED]
        }
      }
    }),
    prisma.postCandidate.count({
      where: {
        status: {
          in: [CandidateStatus.SKIPPED, CandidateStatus.ARCHIVED]
        }
      }
    }),
    prisma.replySubmission.count({
      where: {
        submissionMode: SubmissionMode.DIRECT_SUBMIT,
        success: true
      }
    }),
    prisma.replySubmission.count({
      where: {
        submissionMode: SubmissionMode.MANUAL_COPY,
        success: true
      }
    }),
    prisma.draftReply.findMany({
      where: {
        editDistance: {
          not: null
        }
      },
      select: {
        editDistance: true
      }
    }),
    prisma.draftReply.findMany({
      select: {
        confidence: true
      }
    }),
    prisma.draftReply.count({
      where: {
        optionalCTAText: {
          not: null
        },
        NOT: {
          optionalCTAText: ""
        }
      }
    }),
    prisma.draftReply.count({
      where: {
        OR: [
          { optionalCTAText: null },
          { optionalCTAText: "" }
        ]
      }
    }),
    prisma.postCandidate.groupBy({
      by: ["subreddit"],
      _count: {
        subreddit: true
      }
    }),
    prisma.postCandidate.groupBy({
      by: ["subreddit"],
      where: {
        status: {
          in: [CandidateStatus.APPROVED, CandidateStatus.SUBMITTED]
        }
      },
      _count: {
        subreddit: true
      }
    }),
    prisma.notificationEvent.count({
      where: { success: true }
    }),
    prisma.notificationEvent.count({
      where: { success: false }
    }),
    prisma.postCandidate.count({
      where: { status: CandidateStatus.REVIEWED }
    }),
    prisma.postCandidate.groupBy({
      by: ["status"],
      _count: {
        status: true
      }
    }),
    prisma.draftReply.count({
      where: {
        finalAction: {
          in: [DraftFinalAction.COPY, DraftFinalAction.SUBMIT]
        },
        optionalCTAText: {
          not: null
        },
        NOT: {
          optionalCTAText: ""
        }
      }
    }),
    prisma.draftReply.count({
      where: {
        finalAction: {
          in: [DraftFinalAction.COPY, DraftFinalAction.SUBMIT]
        },
        OR: [
          { optionalCTAText: null },
          { optionalCTAText: "" }
        ]
      }
    })
  ]);

  const approvedMap = new Map(
    approvedGroups.map((group) => [group.subreddit, group._count.subreddit])
  );

  const subredditsByApprovalRate = candidateGroups
    .map((group) => {
      const approved = approvedMap.get(group.subreddit) ?? 0;
      const total = group._count.subreddit;

      return {
        subreddit: group.subreddit,
        approvalRate: total === 0 ? 0 : Number(((approved / total) * 100).toFixed(1)),
        approved,
        total
      };
    })
    .sort((a, b) => b.approvalRate - a.approvalRate);

  return {
    scannedPosts: scanRuns.reduce((sum, run) => sum + run.scannedCount, 0),
    candidatesSelected: totalCandidates,
    draftsGenerated: totalDrafts,
    draftsApproved: approvedCandidates,
    draftsSkipped: skippedCandidates,
    draftsSubmitted: directSubmissions,
    copyOnlyUsage: copyOnlySubmissions,
    draftsNeedingManualReview: manualReviewCount,
    averageEditDistance: Number(
      average(
        draftEditDistances.map((entry) => entry.editDistance ?? 0)
      ).toFixed(2)
    ),
    averageConfidence: Number(
      average(draftConfidences.map((entry) => entry.confidence)).toFixed(2)
    ),
    subredditsByApprovalRate,
    draftsWithCTA: ctaDrafts,
    draftsWithoutCTA: noCtaDrafts,
    approvalByCTA: {
      withCTA: approvedWithCta,
      withoutCTA: approvedWithoutCta
    },
    copyVsSubmit: {
      copy: copyOnlySubmissions,
      submit: directSubmissions
    },
    notifications: {
      sent: notificationSentCount,
      failed: notificationFailureCount
    },
    statusBreakdown: statusBreakdown.map((row) => ({
      status: row.status,
      count: row._count.status
    })),
    editingSignals: {
      shortenedReplies: await prisma.draftReply.count({
        where: { replyShortened: true }
      }),
      softenedTone: await prisma.draftReply.count({
        where: { toneSoftened: true }
      }),
      ctaRemoved: await prisma.draftReply.count({
        where: { ctaRemoved: true }
      }),
      skippedAfterEdit: await prisma.draftReply.count({
        where: { finalAction: DraftFinalAction.SKIP }
      })
    },
    recentScanRuns: scanRuns
  };
}
