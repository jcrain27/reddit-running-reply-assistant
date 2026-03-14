import { CandidateStatus } from "@prisma/client";
import Link from "next/link";

import { CommentReplyRowActions } from "@/components/comment-reply-row-actions";
import { RunScanButton } from "@/components/run-scan-button";
import { StatusBadge } from "@/components/status-badge";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listCommentReplyCandidates } from "@/lib/repositories/commentReplyRepository";
import { formatAge, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RepliesPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: CandidateStatus }>;
}) {
  await requireSession();
  const params = (await searchParams) || {};
  const candidates = await listCommentReplyCandidates(params.status);
  const [replyCount, draftedCount, submittedCount, trackedCount] = await Promise.all([
    prisma.commentReplyCandidate.count(),
    prisma.commentReplyCandidate.count({
      where: {
        status: CandidateStatus.DRAFTED
      }
    }),
    prisma.commentReplyCandidate.count({
      where: {
        status: CandidateStatus.SUBMITTED
      }
    }),
    prisma.trackedRedditComment.count({
      where: {
        monitoringEnabled: true
      }
    })
  ]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Replies</h1>
          <p className="page-copy">
            Watch for replies to Johnny&apos;s live comments, get notified, and keep the thread going naturally.
          </p>
        </div>
        <RunScanButton />
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <p className="metric-label">Tracked comments</p>
          <p className="metric-value">{trackedCount}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Reply candidates</p>
          <p className="metric-value">{replyCount}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Ready to review</p>
          <p className="metric-value">{draftedCount}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Submitted follow-ups</p>
          <p className="metric-value">{submittedCount}</p>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar" style={{ marginBottom: 16 }}>
          {[
            ["All", "/replies"],
            ["Drafted", "/replies?status=DRAFTED"],
            ["Reviewed", "/replies?status=REVIEWED"],
            ["Submitted", "/replies?status=SUBMITTED"],
            ["Skipped", "/replies?status=SKIPPED"]
          ].map(([label, href]) => (
            <Link key={href} href={href} className="button-ghost">
              {label}
            </Link>
          ))}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Conversation</th>
                <th>Reply author</th>
                <th>Age</th>
                <th>Signals</th>
                <th>Risk</th>
                <th>Draft</th>
                <th>Notification</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => {
                const latestDraft = candidate.draftReplies[0];
                const latestNotification = candidate.notificationEvents[0];

                return (
                  <tr key={candidate.id}>
                    <td>
                      <span className="table-title">
                        r/{candidate.subreddit}: {candidate.parentPostTitle || "Reply to your comment"}
                      </span>
                      <span className="table-subtle">{truncate(candidate.bodyText, 140)}</span>
                    </td>
                    <td className="mono">{candidate.author}</td>
                    <td>{formatAge(candidate.createdUtc)}</td>
                    <td>
                      <div className="pill-row">
                        <StatusBadge label={`Intent ${candidate.responseIntentScore}`} />
                        <StatusBadge label={`Fit ${candidate.conversationFitScore}`} />
                        <StatusBadge label={`Priority ${candidate.priorityScore}`} tone="success" />
                      </div>
                    </td>
                    <td>
                      <div className="pill-row">
                        <StatusBadge
                          label={`Medical ${candidate.medicalRiskScore}`}
                          tone={candidate.medicalRiskScore >= 60 ? "danger" : "neutral"}
                        />
                        <StatusBadge label={`${candidate.score ?? 0} score`} />
                      </div>
                    </td>
                    <td>
                      <div className="pill-row">
                        <StatusBadge
                          label={candidate.status}
                          tone={
                            candidate.status === CandidateStatus.SUBMITTED
                              ? "success"
                              : candidate.status === CandidateStatus.SKIPPED ||
                                  candidate.status === CandidateStatus.ARCHIVED
                                ? "warning"
                                : candidate.status === CandidateStatus.FAILED
                                  ? "danger"
                                  : "neutral"
                          }
                        />
                        {latestDraft?.modelName === "fallback-template" ? (
                          <StatusBadge label="Fallback draft" tone="warning" />
                        ) : null}
                        <span className="table-subtle">
                          {latestDraft ? `${latestDraft.confidence.toFixed(2)} conf.` : "No draft"}
                        </span>
                      </div>
                    </td>
                    <td>
                      {latestNotification ? (
                        <StatusBadge
                          label={latestNotification.success ? "Sent" : "Failed"}
                          tone={latestNotification.success ? "success" : "warning"}
                        />
                      ) : (
                        <span className="table-subtle">Not sent</span>
                      )}
                    </td>
                    <td>
                      <CommentReplyRowActions candidateId={candidate.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
