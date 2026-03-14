CREATE TYPE "TrackedCommentSource" AS ENUM ('DIRECT_SUBMIT', 'MANUAL_TRACK');

CREATE TABLE "TrackedRedditComment" (
  "id" TEXT NOT NULL,
  "postCandidateId" TEXT,
  "redditCommentId" TEXT NOT NULL,
  "redditThingId" TEXT NOT NULL,
  "subreddit" TEXT NOT NULL,
  "author" TEXT,
  "commentPermalink" TEXT NOT NULL,
  "parentPostPermalink" TEXT NOT NULL,
  "parentPostTitle" TEXT,
  "parentPostBody" TEXT,
  "bodyText" TEXT NOT NULL,
  "source" "TrackedCommentSource" NOT NULL,
  "monitoringEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lastCheckedAt" TIMESTAMP(3),
  "lastReplySeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrackedRedditComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommentReplyCandidate" (
  "id" TEXT NOT NULL,
  "trackedCommentId" TEXT NOT NULL,
  "redditCommentId" TEXT NOT NULL,
  "redditThingId" TEXT NOT NULL,
  "subreddit" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "permalink" TEXT NOT NULL,
  "parentPostPermalink" TEXT NOT NULL,
  "parentPostTitle" TEXT,
  "bodyText" TEXT NOT NULL,
  "createdUtc" TIMESTAMP(3) NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "score" INTEGER,
  "responseIntentScore" INTEGER NOT NULL,
  "conversationFitScore" INTEGER NOT NULL,
  "medicalRiskScore" INTEGER NOT NULL,
  "priorityScore" INTEGER NOT NULL,
  "selectedReason" TEXT NOT NULL,
  "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
  "notificationPriority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommentReplyCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommentReplyDraft" (
  "id" TEXT NOT NULL,
  "commentReplyCandidateId" TEXT NOT NULL,
  "modelName" TEXT NOT NULL,
  "systemPromptVersion" TEXT NOT NULL,
  "userPromptVersion" TEXT NOT NULL,
  "draftText" TEXT NOT NULL,
  "alternateDraftText" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL,
  "generationReasoning" TEXT,
  "safetyWarnings" JSONB,
  "openingLine" TEXT,
  "duplicateRiskScore" INTEGER NOT NULL DEFAULT 0,
  "promotionalRiskScore" INTEGER NOT NULL DEFAULT 0,
  "medicalCertaintyRiskScore" INTEGER NOT NULL DEFAULT 0,
  "humanEditedText" TEXT,
  "finalAction" "DraftFinalAction" NOT NULL DEFAULT 'NONE',
  "editDistance" INTEGER,
  "replyShortened" BOOLEAN,
  "toneSoftened" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommentReplyDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommentReplyNotificationEvent" (
  "id" TEXT NOT NULL,
  "commentReplyCandidateId" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "success" BOOLEAN NOT NULL,
  "errorMessage" TEXT,
  CONSTRAINT "CommentReplyNotificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommentReplySubmission" (
  "id" TEXT NOT NULL,
  "commentReplyCandidateId" TEXT NOT NULL,
  "commentReplyDraftId" TEXT,
  "submissionMode" "SubmissionMode" NOT NULL,
  "redditCommentId" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "success" BOOLEAN NOT NULL,
  "errorMessage" TEXT,
  CONSTRAINT "CommentReplySubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrackedRedditComment_redditCommentId_key" ON "TrackedRedditComment"("redditCommentId");
CREATE UNIQUE INDEX "TrackedRedditComment_redditThingId_key" ON "TrackedRedditComment"("redditThingId");
CREATE UNIQUE INDEX "TrackedRedditComment_commentPermalink_key" ON "TrackedRedditComment"("commentPermalink");
CREATE UNIQUE INDEX "CommentReplyCandidate_redditCommentId_key" ON "CommentReplyCandidate"("redditCommentId");
CREATE UNIQUE INDEX "CommentReplyCandidate_permalink_key" ON "CommentReplyCandidate"("permalink");
CREATE INDEX "TrackedRedditComment_subreddit_createdAt_idx" ON "TrackedRedditComment"("subreddit", "createdAt");
CREATE INDEX "TrackedRedditComment_monitoringEnabled_updatedAt_idx" ON "TrackedRedditComment"("monitoringEnabled", "updatedAt");
CREATE INDEX "CommentReplyCandidate_status_createdAt_idx" ON "CommentReplyCandidate"("status", "createdAt");
CREATE INDEX "CommentReplyCandidate_trackedCommentId_createdAt_idx" ON "CommentReplyCandidate"("trackedCommentId", "createdAt");
CREATE INDEX "CommentReplyDraft_commentReplyCandidateId_createdAt_idx" ON "CommentReplyDraft"("commentReplyCandidateId", "createdAt");
CREATE INDEX "CommentReplyNotificationEvent_commentReplyCandidateId_sentAt_idx" ON "CommentReplyNotificationEvent"("commentReplyCandidateId", "sentAt");
CREATE INDEX "CommentReplySubmission_commentReplyCandidateId_submittedAt_idx" ON "CommentReplySubmission"("commentReplyCandidateId", "submittedAt");

ALTER TABLE "TrackedRedditComment"
  ADD CONSTRAINT "TrackedRedditComment_postCandidateId_fkey"
  FOREIGN KEY ("postCandidateId")
  REFERENCES "PostCandidate"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "CommentReplyCandidate"
  ADD CONSTRAINT "CommentReplyCandidate_trackedCommentId_fkey"
  FOREIGN KEY ("trackedCommentId")
  REFERENCES "TrackedRedditComment"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "CommentReplyDraft"
  ADD CONSTRAINT "CommentReplyDraft_commentReplyCandidateId_fkey"
  FOREIGN KEY ("commentReplyCandidateId")
  REFERENCES "CommentReplyCandidate"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "CommentReplyNotificationEvent"
  ADD CONSTRAINT "CommentReplyNotificationEvent_commentReplyCandidateId_fkey"
  FOREIGN KEY ("commentReplyCandidateId")
  REFERENCES "CommentReplyCandidate"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "CommentReplySubmission"
  ADD CONSTRAINT "CommentReplySubmission_commentReplyCandidateId_fkey"
  FOREIGN KEY ("commentReplyCandidateId")
  REFERENCES "CommentReplyCandidate"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "CommentReplySubmission"
  ADD CONSTRAINT "CommentReplySubmission_commentReplyDraftId_fkey"
  FOREIGN KEY ("commentReplyDraftId")
  REFERENCES "CommentReplyDraft"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
