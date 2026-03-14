ALTER TABLE "TrackedRedditComment"
  ADD COLUMN "commentReplyCandidateId" TEXT;

CREATE INDEX "TrackedRedditComment_commentReplyCandidateId_idx"
  ON "TrackedRedditComment"("commentReplyCandidateId");

ALTER TABLE "TrackedRedditComment"
  ADD CONSTRAINT "TrackedRedditComment_commentReplyCandidateId_fkey"
  FOREIGN KEY ("commentReplyCandidateId")
  REFERENCES "CommentReplyCandidate"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
