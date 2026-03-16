import { CandidateStatus } from "@prisma/client";
import Link from "next/link";

import { CandidatePreferenceControls } from "@/components/candidate-preference-controls";
import { CandidateRowActions } from "@/components/candidate-row-actions";
import { DismissCandidateButton } from "@/components/dismiss-candidate-button";
import { RunScanButton } from "@/components/run-scan-button";
import { StatusBadge } from "@/components/status-badge";
import { requireSession } from "@/lib/auth";
import { listCandidates } from "@/lib/repositories/candidateRepository";
import { getAnalyticsSummary } from "@/lib/services/analyticsService";
import {
  getPreferenceAdjustmentLabel,
  getSubredditPreferenceAdjustments
} from "@/lib/services/preferenceService";
import { formatAge, safeParseNumber, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DEFAULT_RECENT_WINDOW_HOURS = 24;

function clampDisplayPriority(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

export default async function InboxPage({
  searchParams
}: {
  searchParams?: Promise<{
    status?: CandidateStatus | string;
    q?: string;
    maxAgeHours?: string;
  }>;
}) {
  await requireSession();
  const params = (await searchParams) || {};
  const status =
    typeof params.status === "string" && params.status in CandidateStatus
      ? (params.status as CandidateStatus)
      : undefined;
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const maxAgeHours = Math.min(safeParseNumber(params.maxAgeHours, DEFAULT_RECENT_WINDOW_HOURS), 24);
  const [candidates, analytics, preferenceAdjustments] = await Promise.all([
    listCandidates({
      status,
      search,
      maxAgeHours
    }),
    getAnalyticsSummary(),
    getSubredditPreferenceAdjustments()
  ]);

  const rankedCandidates = [...candidates].sort((left, right) => {
    const leftPriority = clampDisplayPriority(
      left.priorityScore + (preferenceAdjustments.get(left.subreddit) ?? 0)
    );
    const rightPriority = clampDisplayPriority(
      right.priorityScore + (preferenceAdjustments.get(right.subreddit) ?? 0)
    );

    if (rightPriority !== leftPriority) {
      return rightPriority - leftPriority;
    }

    return right.createdUtc.getTime() - left.createdUtc.getTime();
  });

  const actionableCandidates = rankedCandidates.filter(
    (candidate) =>
      candidate.status === CandidateStatus.NEW ||
      candidate.status === CandidateStatus.DRAFTED ||
      candidate.status === CandidateStatus.REVIEWED ||
      candidate.status === CandidateStatus.APPROVED
  );
  const focusCandidates = actionableCandidates
    .filter((candidate) => candidate.medicalRiskScore < 60)
    .slice(0, 3);

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
        <form className="form-grid" action="/inbox" method="get" style={{ marginBottom: 20 }}>
          <div className="page-header">
            <div>
              <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
                Recent Posts
              </h2>
              <p className="page-copy">
                Search only fresh candidates. Anything older than 24 hours stays out of this inbox.
              </p>
            </div>
            <div className="toolbar">
              <button type="submit" className="button">
                Update Inbox
              </button>
              <Link href="/inbox" className="button-ghost">
                Reset
              </Link>
            </div>
          </div>

          <div className="fields-3">
            <div className="field">
              <label>Search recent posts</label>
              <input
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Search title, body, author, or subreddit"
              />
            </div>
            <div className="field">
              <label>Recent window</label>
              <select name="maxAgeHours" defaultValue={String(maxAgeHours)}>
                {[6, 12, 18, 24].map((hours) => (
                  <option key={hours} value={hours}>
                    Last {hours} hours
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select name="status" defaultValue={status ?? ""}>
                <option value="">All statuses</option>
                {Object.values(CandidateStatus).map((candidateStatus) => (
                  <option key={candidateStatus} value={candidateStatus}>
                    {candidateStatus}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>

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

        <div className="split-list" style={{ marginBottom: 20 }}>
          <div className="notice">
            Showing {candidates.length} candidate{candidates.length === 1 ? "" : "s"} from the last {maxAgeHours} hours.
          </div>
          <div className="notice">
            Focus today: {focusCandidates.length} best post{focusCandidates.length === 1 ? "" : "s"} to review first.
          </div>
        </div>

        <div className="panel panel-tight" style={{ marginBottom: 20 }}>
          <div className="page-header">
            <div>
              <h2 className="page-title" style={{ fontSize: "1.25rem" }}>
                Top 3 To Review Today
              </h2>
              <p className="page-copy">
                Start here and stop after 2-3 strong replies unless someone follows up in a thread.
              </p>
            </div>
          </div>

          <div className="split-list">
            {focusCandidates.length ? (
              focusCandidates.map((candidate) => {
                const adjustment = preferenceAdjustments.get(candidate.subreddit) ?? 0;
                const preferenceLabel = getPreferenceAdjustmentLabel(adjustment);
                const adjustedPriority = clampDisplayPriority(candidate.priorityScore + adjustment);

                return (
                  <div key={candidate.id} className="notice">
                    <div className="page-header" style={{ alignItems: "center" }}>
                      <div>
                        <strong>
                          r/{candidate.subreddit}: {candidate.title}
                        </strong>
                        <div className="table-subtle" style={{ marginTop: 6 }}>
                          {truncate(candidate.selectedReason, 150)}
                        </div>
                      </div>
                      <div className="toolbar">
                        <StatusBadge label={`Priority ${adjustedPriority}`} tone="success" />
                        {preferenceLabel ? <StatusBadge label={preferenceLabel} /> : null}
                        <StatusBadge label={formatAge(candidate.createdUtc)} />
                        <CandidatePreferenceControls
                          candidateId={candidate.id}
                          currentSignal={candidate.preferenceFeedback?.signal}
                          compact
                        />
                        <DismissCandidateButton candidateId={candidate.id} />
                        <Link href={`/candidates/${candidate.id}`} className="button-ghost">
                          Review
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="notice">
                No strong fresh candidates right now. Run a scan later or widen the search terms, but keep the 24-hour cap.
              </div>
            )}
          </div>
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
              {rankedCandidates.map((candidate) => {
                const latestDraft = candidate.draftReplies[0];
                const latestNotification = candidate.notificationEvents[0];
                const preferenceAdjustment = preferenceAdjustments.get(candidate.subreddit) ?? 0;
                const adjustedPriority = clampDisplayPriority(candidate.priorityScore + preferenceAdjustment);
                const preferenceLabel = getPreferenceAdjustmentLabel(preferenceAdjustment);

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
                        <StatusBadge label={`Priority ${adjustedPriority}`} tone="success" />
                        {preferenceLabel ? <StatusBadge label={preferenceLabel} /> : null}
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
