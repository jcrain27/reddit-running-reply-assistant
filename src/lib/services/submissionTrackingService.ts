import { TrackedCommentSource } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { redditThingIdFromCommentId } from "@/lib/services/redditClient";

export async function createTrackedCommentFromPostSubmission(input: {
  candidateId: string;
  redditCommentId: string;
  bodyText: string;
}) {
  const candidate = await prisma.postCandidate.findUnique({
    where: { id: input.candidateId }
  });

  if (!candidate) {
    throw new Error("Candidate not found for tracked submission.");
  }

  const commentPermalink = `${candidate.permalink.replace(/\/+$/, "")}/${input.redditCommentId}/`;

  return prisma.trackedRedditComment.upsert({
    where: { redditCommentId: input.redditCommentId },
    update: {
      redditThingId: redditThingIdFromCommentId(input.redditCommentId),
      subreddit: candidate.subreddit,
      author: getEnv().REDDIT_USERNAME ?? null,
      commentPermalink,
      parentPostPermalink: candidate.permalink,
      parentPostTitle: candidate.title,
      parentPostBody: candidate.bodyText,
      bodyText: input.bodyText,
      source: TrackedCommentSource.DIRECT_SUBMIT,
      monitoringEnabled: true
    },
    create: {
      postCandidateId: candidate.id,
      redditCommentId: input.redditCommentId,
      redditThingId: redditThingIdFromCommentId(input.redditCommentId),
      subreddit: candidate.subreddit,
      author: getEnv().REDDIT_USERNAME ?? null,
      commentPermalink,
      parentPostPermalink: candidate.permalink,
      parentPostTitle: candidate.title,
      parentPostBody: candidate.bodyText,
      bodyText: input.bodyText,
      source: TrackedCommentSource.DIRECT_SUBMIT
    }
  });
}
