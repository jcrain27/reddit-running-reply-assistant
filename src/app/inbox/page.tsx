import { CandidateStatus } from "@prisma/client";
import Link from "next/link";

import { CandidateRowActions } from "@/components/candidate-row-actions";
import { RunScanButton } from "@/components/run-scan-button";
import { StatusBadge } from "@/components/status-badge";
import { requireSession } from "@/lib/auth";
import { listCandidates } from "@/lib/repositories/candidateRepository";
import { getAnalyticsSummary } from "@/lib/services/analyticsService";
import { formatAge, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: CandidateStatus }>;
}) {
  await requireSession();
  const params = (await searchParams) || {};
  const candidates = await listCandidates(params.status);
  const analytics = await getAnalyticsSummary();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inbox</h1>
          <p className="page-copy">
            Rank fresh Reddit advice opportunities, review the draft, and keep promotion risk tightly controlled.
          </p>
        </div>
        <RunScanButton />
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <p className="metric-label">Candidates</p>
          <p className="metric-value">{analytics.candidatesSelected}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Drafts generated</p>
          <p className="metric-value">{analytics.draftsGenerated}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Copy-only usage</p>
          <p className="metric-value">{analytics.copyOnlyUsage}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Direct submits</p>
          <p className="metric-value">{analytics.draftsSubmitted}</p>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar" style={{ marginBottom: 16 }}>
          {[
            ["All", "/inbox"],
            ["Drafted", "/inbox?status=DRAFTED"],
            ["Reviewed", "/inbox?status=REVIEWED"],
            ["Submitted", "/inbox?status=SUBMITTED"],
            ["Skipped", "/inbox?status=SKIPPED"]
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
                <th>Post</th>
                <th>Author</th>
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
                        r/{candidate.subreddit}: {candidate.title}
                      </span>
                      <span className="table-subtle">{truncate(candidate.selectedReason, 120)}</span>
                    </td>
                    <td className="mono">{candidate.author}</td>
                    <td>{formatAge(candidate.createdUtc)}</td>
                    <td>
                      <div className="pill-row">
                        <StatusBadge label={`Advice ${candidate.adviceScore}`} />
                        <StatusBadge label={`Priority ${candidate.priorityScore}`} tone="success" />
                        <StatusBadge label={`${candidate.score ?? 0} ups / ${candidate.numComments ?? 0} com`} />
                      </div>
                    </td>
                    <td>
                      <div className="pill-row">
                        <StatusBadge
                          label={`Promo ${candidate.promoRiskScore}`}
                          tone={candidate.promoRiskScore >= 60 ? "warning" : "neutral"}
                        />
                        <StatusBadge
                          label={`Medical ${candidate.medicalRiskScore}`}
                          tone={candidate.medicalRiskScore >= 60 ? "danger" : "neutral"}
                        />
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
                      <CandidateRowActions candidateId={candidate.id} />
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
