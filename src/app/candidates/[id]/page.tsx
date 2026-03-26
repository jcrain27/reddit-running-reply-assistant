import { notFound } from "next/navigation";

import { CandidateEditor } from "@/components/candidate-editor";
import { CandidatePreferenceControls } from "@/components/candidate-preference-controls";
import { StatusBadge } from "@/components/status-badge";
import { TrackCommentForm } from "@/components/track-comment-form";
import { requireSession } from "@/lib/auth";
import { getCandidateDetail } from "@/lib/repositories/candidateRepository";
import { prisma } from "@/lib/db";
import {
  getPreferenceAdjustmentLabel,
  getSubredditPreferenceAdjustments
} from "@/lib/services/preferenceService";
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

  const [config, appSettings, preferenceAdjustments] = await Promise.all([
    prisma.subredditConfig.findUnique({
      where: { name: candidate.subreddit }
    }),
    getAppSettings(),
    getSubredditPreferenceAdjustments()
  ]);
  const preferenceAdjustment = preferenceAdjustments.get(candidate.subreddit) ?? 0;
  const preferenceLabel = getPreferenceAdjustmentLabel(preferenceAdjustment);
  const adjustedPriority = Math.min(Math.max(candidate.priorityScore + preferenceAdjustment, 0), 100);

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
              <StatusBadge label={`Priority ${adjustedPriority}`} tone="success" />
              {preferenceLabel ? <StatusBadge label={preferenceLabel} /> : null}
            </div>
          </div>

          <div className="panel">
            <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
              Preference Tuning
            </h2>
            <p className="page-copy">
              Tell the inbox whether you want more or less of this kind of post. Right now this nudges future ranking at the subreddit level, so it helps shape tomorrow&apos;s shortlist without overfitting to one thread.
            </p>
            <div style={{ marginTop: 14 }}>
              <CandidatePreferenceControls
                candidateId={candidate.id}
                currentSignal={candidate.preferenceFeedback?.signal}
              />
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
            recommendedBlog={
              latestDraft.recommendedBlogPost
                ? {
                    title: latestDraft.recommendedBlogPost.title,
                    url: latestDraft.recommendedBlogPost.url,
                    reason: latestDraft.recommendedBlogReason
                  }
                : undefined
            }
            allowBlogLinkAppend={Boolean(config?.allowCTA && !config?.strictNoPromo)}
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

          {latestDraft.recommendedBlogPost ? (
            <div className="panel">
              <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
                Matched Blog Context
              </h2>
              <div className="draft-box">
                <strong>{latestDraft.recommendedBlogPost.title}</strong>
                <div style={{ marginTop: 10 }}>{latestDraft.recommendedBlogPost.summaryText}</div>
                {latestDraft.recommendedBlogReason ? (
                  <div style={{ marginTop: 10 }}>
                    <strong>Why it matched:</strong> {latestDraft.recommendedBlogReason}
                  </div>
                ) : null}
                <div style={{ marginTop: 10 }}>
                  <a href={latestDraft.recommendedBlogPost.url} target="_blank" rel="noreferrer">
                    {latestDraft.recommendedBlogPost.url}
                  </a>
                </div>
              </div>
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
