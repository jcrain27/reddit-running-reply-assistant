import { requireSession } from "@/lib/auth";
import { getAnalyticsSummary } from "@/lib/services/analyticsService";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await requireSession();
  const analytics = await getAnalyticsSummary();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-copy">
            Track what gets drafted, what Johnny edits, and where the highest-quality reply opportunities are showing up.
          </p>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <p className="metric-label">Scanned posts</p>
          <p className="metric-value">{analytics.scannedPosts}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Candidates selected</p>
          <p className="metric-value">{analytics.candidatesSelected}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Average edit distance</p>
          <p className="metric-value">{analytics.averageEditDistance}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Drafts with CTA</p>
          <p className="metric-value">{analytics.draftsWithCTA}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Manual review queue</p>
          <p className="metric-value">{analytics.draftsNeedingManualReview}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Average confidence</p>
          <p className="metric-value">{analytics.averageConfidence}</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
            Approval Rate by Subreddit
          </h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Subreddit</th>
                  <th>Approved</th>
                  <th>Total</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {analytics.subredditsByApprovalRate.map((row) => (
                  <tr key={row.subreddit}>
                    <td className="mono">{row.subreddit}</td>
                    <td>{row.approved}</td>
                    <td>{row.total}</td>
                    <td>{row.approvalRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
            Editing Signals
          </h2>
          <div className="split-list">
            <div className="notice">
              Replies shortened: {analytics.editingSignals.shortenedReplies}
            </div>
            <div className="notice">Tone softened: {analytics.editingSignals.softenedTone}</div>
            <div className="notice">CTA removed: {analytics.editingSignals.ctaRemoved}</div>
            <div className="notice">Skipped after edit: {analytics.editingSignals.skippedAfterEdit}</div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
            Notification Health
          </h2>
          <div className="split-list">
            <div className="notice">Sent successfully: {analytics.notifications.sent}</div>
            <div className="notice">Failed: {analytics.notifications.failed}</div>
          </div>
        </div>

        <div className="panel">
          <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
            CTA Outcomes
          </h2>
          <div className="split-list">
            <div className="notice">Approved or submitted with CTA: {analytics.approvalByCTA.withCTA}</div>
            <div className="notice">
              Approved or submitted without CTA: {analytics.approvalByCTA.withoutCTA}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
          Candidate Status Breakdown
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {analytics.statusBreakdown.map((row) => (
                <tr key={row.status}>
                  <td>{row.status}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
          Recent Scan Runs
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Started</th>
                <th>Scanned</th>
                <th>Candidates</th>
                <th>Drafted</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {analytics.recentScanRuns.map((run) => (
                <tr key={run.id}>
                  <td>{run.status}</td>
                  <td>{new Date(run.startedAt).toLocaleString()}</td>
                  <td>{run.scannedCount}</td>
                  <td>{run.candidateCount}</td>
                  <td>{run.draftedCount}</td>
                  <td>{run.errorCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
