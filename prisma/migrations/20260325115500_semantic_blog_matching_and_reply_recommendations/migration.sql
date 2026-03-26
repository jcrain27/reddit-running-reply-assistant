ALTER TABLE "BlogPost"
  ADD COLUMN "semanticEmbedding" JSONB,
  ADD COLUMN "semanticEmbeddingModel" TEXT,
  ADD COLUMN "semanticEmbeddingUpdatedAt" TIMESTAMP(3);

ALTER TABLE "CommentReplyDraft"
  ADD COLUMN "recommendedBlogPostId" TEXT,
  ADD COLUMN "recommendedBlogReason" TEXT,
  ADD COLUMN "recommendedBlogMatchScore" DOUBLE PRECISION;

CREATE INDEX "CommentReplyDraft_recommendedBlogPostId_idx"
  ON "CommentReplyDraft"("recommendedBlogPostId");

ALTER TABLE "CommentReplyDraft"
  ADD CONSTRAINT "CommentReplyDraft_recommendedBlogPostId_fkey"
  FOREIGN KEY ("recommendedBlogPostId")
  REFERENCES "BlogPost"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
