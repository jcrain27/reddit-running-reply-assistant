import { notFound } from "next/navigation";

import { CandidateEditor } from "@/components/candidate-editor";
import { StatusBadge } from "@/components/status-badge";
import { TrackCommentForm } from "@/components/track-comment-form";
import { requireSession } from "@/lib/auth";
import { getCandidateDetail } from "@/lib/repositories/candidateRepository";
import { prisma } from "@/lib/db";
import { getAppSettings } from "@/lib/services/settingsService";
import { formatAge } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CandidateDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const candidate = await getCandidateDetail(id);

  if (!candidate) {
    notFound();
  }

  const latestDraft = candidate.draftReplies[0];
  if (!latestDraft) {
    notFound();
  }

  const [config, appSettings] = await Promise.all([
    prisma.subredditConfig.findUnique({
      where: { name: candidate.subreddit }
    }),
    getAppSettings()
  ]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="brand-kicker">r/{candidate.subreddit}</p>
          <h1 className="page-title">{candidate.title}</h1>
          <p className="page-copy">
            {candidate.author} • {formatAge(candidate.createdUtc)} • {candidate.score ?? 0} upvotes •{" "}
            {candidate.numComments ?? 0} comments
          </p>
        </div>

        <div className="pill-row">
          <StatusBadge label={candidate.status} />
          <StatusBadge label={`Advice ${candidate.adviceScore}`} />
          <StatusBadge label={`Promo ${candidate.promoRiskScore}`} />
          <StatusBadge
            label={`Medical ${candidate.medicalRiskScore}`}
            tone={candidate.medicalRiskScore >= 60 ? "danger" : "warning"}
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="page">
          <div className="panel">
            <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
              Why This Was Selected
            </h2>
            <p className="page-copy">{candidate.selectedReason}</p>
            <div className="pill-row" style={{ marginTop: 14 }}>
              <StatusBadge label={`Relevance ${candidate.relevanceScore}`} />
              <StatusBadge label={`Engagement ${candidate.engagementScore}`} />
              <StatusBadge label={`Priority ${candidate.priorityScore}`} tone="success" />
            </div>
          </div>

          <div className="panel">
            <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
              Original Post
            </h2>
            <div className="candidate-body">{candidate.bodyText || "(No body text provided.)"}</div>
          </div>

          {latestDraft.modelName === "fallback-template" ? (
            <div className="notice warning">
              This draft came from the local fallback generator, not OpenAI. If this keeps appearing,
              the OpenAI request is likely failing or returning an unusable response.
            </div>
          ) : null}

          <CandidateEditor
            candidateId={candidate.id}
            draftReplyId={latestDraft.id}
            permalink={candidate.permalink}
            initialDraft={latestDraft.humanEditedText || latestDraft.draftText}
            alternateDraft={latestDraft.alternateDraftText || undefined}
            optionalCTA={latestDraft.optionalCTAText || undefined}
            safetyWarnings={Array.isArray(latestDraft.safetyWarnings) ? (latestDraft.safetyWarnings as string[]) : []}
            directSubmitEnabled={Boolean(appSettings.enableDirectSubmit && config?.allowDirectSubmit)}
          />

          <TrackCommentForm endpoint={`/api/candidates/${candidate.id}/track-manual-comment`} />
        </div>

        <div className="page">
          <div className="panel">
            <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
              Draft Snapshot
            </h2>
            <div className="draft-box">{latestDraft.draftText}</div>
          </div>

          {latestDraft.alternateDraftText ? (
            <div className="panel">
              <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
                Alternate Draft
              </h2>
              <div className="draft-box">{latestDraft.alternateDraftText}</div>
            </div>
          ) : null}

          {latestDraft.optionalCTAText ? (
            <div className="panel">
              <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
                Optional CTA Suggestion
              </h2>
              <div className="draft-box">{latestDraft.optionalCTAText}</div>
            </div>
          ) : null}

          {candidate.trackedComments.length ? (
            <div className="panel">
              <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
                Live Comments Being Monitored
              </h2>
              <div className="split-list">
                {candidate.trackedComments.map((trackedComment) => (
                  <div key={trackedComment.id} className="notice">
                    <strong>{trackedComment.source === "DIRECT_SUBMIT" ? "Direct submit" : "Manual copy"}</strong>
                    <div style={{ marginTop: 8 }}>
                      <a href={trackedComment.commentPermalink} target="_blank" rel="noreferrer">
                        {trackedComment.commentPermalink}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="panel">
            <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
              Scan and Delivery
            </h2>
            <div className="split-list">
              <div className="notice">
                <strong>Reasoning</strong>
                <div style={{ marginTop: 8 }}>{latestDraft.generationReasoning || "No notes captured."}</div>
              </div>
              <div className="notice">
                <strong>Notifications</strong>
                <div style={{ marginTop: 8 }}>
                  {candidate.notificationEvents.length
                    ? candidate.notificationEvents
                        .map((event) => `${event.channel}: ${event.success ? "sent" : "failed"}`)
                        .join(", ")
                    : "No notification sent yet."}
                </div>
              </div>
              <div className="notice">
                <strong>Submission history</strong>
                <div style={{ marginTop: 8 }}>
                  {candidate.replySubmissions.length
                    ? candidate.replySubmissions
                        .map((submission) =>
                          `${submission.submissionMode} - ${submission.success ? "success" : "failed"}`
                        )
                        .join(", ")
                    : "No submission recorded yet."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
