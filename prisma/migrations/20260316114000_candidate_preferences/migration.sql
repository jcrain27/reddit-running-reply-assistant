CREATE TYPE "PreferenceSignal" AS ENUM ('MORE', 'LESS');

CREATE TABLE "CandidatePreferenceFeedback" (
  "id" TEXT NOT NULL,
  "postCandidateId" TEXT NOT NULL,
  "subreddit" TEXT NOT NULL,
  "signal" "PreferenceSignal" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidatePreferenceFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidatePreferenceFeedback_postCandidateId_key"
  ON "CandidatePreferenceFeedback"("postCandidateId");

CREATE INDEX "CandidatePreferenceFeedback_subreddit_updatedAt_idx"
  ON "CandidatePreferenceFeedback"("subreddit", "updatedAt");

ALTER TABLE "CandidatePreferenceFeedback"
  ADD CONSTRAINT "CandidatePreferenceFeedback_postCandidateId_fkey"
  FOREIGN KEY ("postCandidateId")
  REFERENCES "PostCandidate"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
