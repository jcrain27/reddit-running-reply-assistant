CREATE TYPE "BlogSyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

CREATE TABLE "BlogPost" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "author" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "summaryText" TEXT NOT NULL,
  "contentText" TEXT NOT NULL,
  "matchKeywords" JSONB NOT NULL,
  "sourceFeedUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlogSyncRun" (
  "id" TEXT NOT NULL,
  "feedUrl" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "status" "BlogSyncStatus" NOT NULL DEFAULT 'RUNNING',
  "fetchedCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlogSyncRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DraftReply"
  ADD COLUMN "recommendedBlogPostId" TEXT,
  ADD COLUMN "recommendedBlogReason" TEXT,
  ADD COLUMN "recommendedBlogMatchScore" DOUBLE PRECISION;

CREATE UNIQUE INDEX "BlogPost_url_key" ON "BlogPost"("url");
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");

CREATE INDEX "BlogPost_publishedAt_idx" ON "BlogPost"("publishedAt");
CREATE INDEX "BlogSyncRun_createdAt_idx" ON "BlogSyncRun"("createdAt");
CREATE INDEX "DraftReply_recommendedBlogPostId_idx" ON "DraftReply"("recommendedBlogPostId");

ALTER TABLE "DraftReply"
  ADD CONSTRAINT "DraftReply_recommendedBlogPostId_fkey"
  FOREIGN KEY ("recommendedBlogPostId")
  REFERENCES "BlogPost"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
