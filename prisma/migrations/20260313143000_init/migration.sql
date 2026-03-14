CREATE TYPE "CandidateStatus" AS ENUM (
  'NEW',
  'DRAFTED',
  'REVIEWED',
  'APPROVED',
  'SUBMITTED',
  'SKIPPED',
  'ARCHIVED',
  'FAILED'
);

CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SLACK');
CREATE TYPE "SubmissionMode" AS ENUM ('MANUAL_COPY', 'DIRECT_SUBMIT');
CREATE TYPE "DraftFinalAction" AS ENUM ('NONE', 'COPY', 'SUBMIT', 'SKIP', 'ARCHIVE');
CREATE TYPE "ScanStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL_FAILURE', 'FAILED');
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSettings" (
  "id" TEXT NOT NULL DEFAULT 'app',
  "scanFrequencyMinutes" INTEGER NOT NULL DEFAULT 15,
  "maxPostAgeHours" INTEGER NOT NULL DEFAULT 24,
  "minAdviceScore" INTEGER NOT NULL DEFAULT 60,
  "notificationThreshold" INTEGER NOT NULL DEFAULT 85,
  "enableDirectSubmit" BOOLEAN NOT NULL DEFAULT false,
  "enableCTASuggestions" BOOLEAN NOT NULL DEFAULT false,
  "maxSuggestedRepliesPerDay" INTEGER NOT NULL DEFAULT 10,
  "notificationEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "notificationSlackEnabled" BOOLEAN NOT NULL DEFAULT false,
  "notificationEmailTo" TEXT,
  "notificationSlackWebhookUrl" TEXT,
  "medicalRiskKeywords" JSONB NOT NULL,
  "bannedPhrases" JSONB NOT NULL,
  "candidateStatuses" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubredditConfig" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "allowDirectSubmit" BOOLEAN NOT NULL DEFAULT false,
  "allowCTA" BOOLEAN NOT NULL DEFAULT false,
  "strictNoPromo" BOOLEAN NOT NULL DEFAULT true,
  "maxRepliesPerDay" INTEGER NOT NULL DEFAULT 2,
  "minAdviceScore" INTEGER NOT NULL DEFAULT 60,
  "maxReplyLength" INTEGER NOT NULL DEFAULT 900,
  "advancedTone" BOOLEAN NOT NULL DEFAULT false,
  "medicalCautionStrictness" INTEGER NOT NULL DEFAULT 70,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubredditConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PostCandidate" (
  "id" TEXT NOT NULL,
  "redditPostId" TEXT NOT NULL,
  "thingId" TEXT,
  "subreddit" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "permalink" TEXT NOT NULL,
  "url" TEXT,
  "bodyText" TEXT NOT NULL,
  "createdUtc" TIMESTAMP(3) NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "score" INTEGER,
  "numComments" INTEGER,
  "adviceScore" INTEGER NOT NULL,
  "relevanceScore" INTEGER NOT NULL,
  "engagementScore" INTEGER NOT NULL,
  "priorityScore" INTEGER NOT NULL,
  "promoRiskScore" INTEGER NOT NULL,
  "medicalRiskScore" INTEGER NOT NULL,
  "selectedReason" TEXT NOT NULL,
  "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
  "alreadyReplied" BOOLEAN NOT NULL DEFAULT false,
  "notificationPriority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PostCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DraftReply" (
  "id" TEXT NOT NULL,
  "postCandidateId" TEXT NOT NULL,
  "modelName" TEXT NOT NULL,
  "systemPromptVersion" TEXT NOT NULL,
  "userPromptVersion" TEXT NOT NULL,
  "draftText" TEXT NOT NULL,
  "alternateDraftText" TEXT,
  "optionalCTAText" TEXT,
  "ctaAllowed" BOOLEAN NOT NULL DEFAULT false,
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
  "ctaRemoved" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DraftReply_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubredditRule" (
  "id" TEXT NOT NULL,
  "subredditConfigId" TEXT NOT NULL,
  "ruleType" TEXT NOT NULL,
  "ruleValue" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubredditRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationEvent" (
  "id" TEXT NOT NULL,
  "postCandidateId" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "success" BOOLEAN NOT NULL,
  "errorMessage" TEXT,
  CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReplySubmission" (
  "id" TEXT NOT NULL,
  "postCandidateId" TEXT NOT NULL,
  "draftReplyId" TEXT,
  "submissionMode" "SubmissionMode" NOT NULL,
  "redditCommentId" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "success" BOOLEAN NOT NULL,
  "errorMessage" TEXT,
  CONSTRAINT "ReplySubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScanRun" (
  "id" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "scannedCount" INTEGER NOT NULL DEFAULT 0,
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "draftedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "status" "ScanStatus" NOT NULL DEFAULT 'RUNNING',
  "notes" TEXT,
  "triggeredBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScanRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoiceExample" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VoiceExample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "SubredditConfig_name_key" ON "SubredditConfig"("name");
CREATE UNIQUE INDEX "PostCandidate_redditPostId_key" ON "PostCandidate"("redditPostId");
CREATE UNIQUE INDEX "SubredditRule_subredditConfigId_ruleType_ruleValue_key" ON "SubredditRule"("subredditConfigId", "ruleType", "ruleValue");
CREATE INDEX "PostCandidate_subreddit_createdAt_idx" ON "PostCandidate"("subreddit", "createdAt");
CREATE INDEX "PostCandidate_status_createdAt_idx" ON "PostCandidate"("status", "createdAt");
CREATE INDEX "DraftReply_postCandidateId_createdAt_idx" ON "DraftReply"("postCandidateId", "createdAt");
CREATE INDEX "NotificationEvent_postCandidateId_sentAt_idx" ON "NotificationEvent"("postCandidateId", "sentAt");
CREATE INDEX "ReplySubmission_postCandidateId_submittedAt_idx" ON "ReplySubmission"("postCandidateId", "submittedAt");
CREATE INDEX "ScanRun_createdAt_idx" ON "ScanRun"("createdAt");

ALTER TABLE "DraftReply"
  ADD CONSTRAINT "DraftReply_postCandidateId_fkey"
  FOREIGN KEY ("postCandidateId")
  REFERENCES "PostCandidate"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "SubredditRule"
  ADD CONSTRAINT "SubredditRule_subredditConfigId_fkey"
  FOREIGN KEY ("subredditConfigId")
  REFERENCES "SubredditConfig"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "NotificationEvent"
  ADD CONSTRAINT "NotificationEvent_postCandidateId_fkey"
  FOREIGN KEY ("postCandidateId")
  REFERENCES "PostCandidate"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ReplySubmission"
  ADD CONSTRAINT "ReplySubmission_postCandidateId_fkey"
  FOREIGN KEY ("postCandidateId")
  REFERENCES "PostCandidate"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ReplySubmission"
  ADD CONSTRAINT "ReplySubmission_draftReplyId_fkey"
  FOREIGN KEY ("draftReplyId")
  REFERENCES "DraftReply"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
