import { notFound } from "next/navigation";

import { CommentReplyEditor } from "@/components/comment-reply-editor";
import { StatusBadge } from "@/components/status-badge";
import { TrackCommentForm } from "@/components/track-comment-form";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCommentReplyCandidateDetail } from "@/lib/repositories/commentReplyRepository";
import { getAppSettings } from "@/lib/services/settingsService";
import { formatAge } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReplyDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const candidate = await getCommentReplyCandidateDetail(id);

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
          <p className="brand-kicker">Reply Queue • r/{candidate.subreddit}</p>
          <h1 className="page-title">{candidate.parentPostTitle || "Reply to your comment"}</h1>
          <p className="page-copy">
            {candidate.author} replied • {formatAge(candidate.createdUtc)} • {candidate.score ?? 0} score
          </p>
        </div>

        <div className="pill-row">
          <StatusBadge label={candidate.status} />
          <StatusBadge label={`Intent ${candidate.responseIntentScore}`} />
          <StatusBadge label={`Fit ${candidate.conversationFitScore}`} />
          <StatusBadge label={`Priority ${candidate.priorityScore}`} tone="success" />
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
          </div>

          <div className="panel">
            <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
              Johnny&apos;s Live Comment
            </h2>
            <div className="candidate-body">{candidate.trackedComment.bodyText || "(No comment text captured.)"}</div>
          </div>

          <div className="panel">
            <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
              Incoming Reply
            </h2>
            <div className="candidate-body">{candidate.bodyText || "(No reply text provided.)"}</div>
          </div>

          {latestDraft.modelName === "fallback-template" ? (
            <div className="notice warning">
              This follow-up came from the local fallback generator, not OpenAI. If this keeps appearing,
              the OpenAI API request is still failing.
            </div>
          ) : null}

          <CommentReplyEditor
            candidateId={candidate.id}
            draftReplyId={latestDraft.id}
            permalink={candidate.permalink}
            initialDraft={latestDraft.humanEditedText || latestDraft.draftText}
            alternateDraft={latestDraft.alternateDraftText || undefined}
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

          <TrackCommentForm endpoint={`/api/replies/${candidate.id}/track-manual-comment`} />
        </div>

        <div className="page">
          <div className="panel">
            <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
              Parent Post Link
            </h2>
            <div className="toolbar">
              <a href={candidate.parentPostPermalink} target="_blank" rel="noreferrer" className="button-ghost">
                Open Parent Post
              </a>
              <a href={candidate.permalink} target="_blank" rel="noreferrer" className="button-ghost">
                Open Reply Thread
              </a>
            </div>
          </div>

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

          {candidate.trackedResponses.length ? (
            <div className="panel">
              <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
                Live Follow-Ups Being Monitored
              </h2>
              <div className="split-list">
                {candidate.trackedResponses.map((trackedResponse) => (
                  <div key={trackedResponse.id} className="notice">
                    <strong>{trackedResponse.source === "DIRECT_SUBMIT" ? "Direct submit" : "Manual copy"}</strong>
                    <div style={{ marginTop: 8 }}>
                      <a href={trackedResponse.commentPermalink} target="_blank" rel="noreferrer">
                        {trackedResponse.commentPermalink}
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
