import {
  CandidateStatus,
  DraftFinalAction,
  SubmissionMode
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { submitComment } from "@/lib/services/redditClient";
import { createTrackedCommentFromPostSubmission } from "@/lib/services/submissionTrackingService";
import { getAppSettings } from "@/lib/services/settingsService";
import { computeEditDistance, inferReplyShortened, inferToneSoftened } from "@/lib/utils";

export async function submitApprovedReply(input: {
  candidateId: string;
  draftReplyId: string;
  replyText: string;
}) {
  const [candidate, appSettings] = await Promise.all([
    prisma.postCandidate.findUnique({
      where: { id: input.candidateId }
    }),
    getAppSettings()
  ]);

  if (!candidate) {
    throw new Error("Candidate not found.");
  }

  const config = await prisma.subredditConfig.findUnique({
    where: { name: candidate.subreddit }
  });

  if (!config) {
    throw new Error("Subreddit configuration not found.");
  }

  if (!appSettings.enableDirectSubmit || !config.allowDirectSubmit) {
    throw new Error("Direct submit is disabled for this app or subreddit.");
  }

  if (!candidate.thingId) {
    throw new Error("This candidate does not have a Reddit thing id.");
  }

  const draft = await prisma.draftReply.findUnique({
    where: { id: input.draftReplyId }
  });

  if (!draft) {
    throw new Error("Draft not found.");
  }

  try {
    const redditCommentId = await submitComment(candidate.thingId, input.replyText);

    await prisma.$transaction([
      prisma.replySubmission.create({
        data: {
          postCandidateId: candidate.id,
          draftReplyId: draft.id,
          submissionMode: SubmissionMode.DIRECT_SUBMIT,
          redditCommentId,
          success: true
        }
      }),
      prisma.draftReply.update({
        where: { id: draft.id },
        data: {
          humanEditedText: input.replyText,
          finalAction: DraftFinalAction.SUBMIT,
          editDistance: computeEditDistance(draft.draftText, input.replyText),
          replyShortened: inferReplyShortened(draft.draftText, input.replyText),
          toneSoftened: inferToneSoftened(draft.draftText, input.replyText),
          ctaRemoved:
            Boolean(draft.optionalCTAText) &&
            !input.replyText.toLowerCase().includes((draft.optionalCTAText ?? "").toLowerCase())
        }
      }),
      prisma.postCandidate.update({
        where: { id: candidate.id },
        data: {
          status: CandidateStatus.SUBMITTED,
          alreadyReplied: true
        }
      })
    ]);

    await createTrackedCommentFromPostSubmission({
      candidateId: candidate.id,
      redditCommentId,
      bodyText: input.replyText
    });

    return { success: true, redditCommentId };
  } catch (error) {
    await prisma.$transaction([
      prisma.replySubmission.create({
        data: {
          postCandidateId: candidate.id,
          draftReplyId: draft.id,
          submissionMode: SubmissionMode.DIRECT_SUBMIT,
          success: false,
          errorMessage: error instanceof Error ? error.message : "Unknown submission error"
        }
      }),
      prisma.postCandidate.update({
        where: { id: candidate.id },
        data: { status: CandidateStatus.FAILED }
      })
    ]);

    throw error;
  }
}

export async function recordManualCopy(input: {
  candidateId: string;
  draftReplyId: string;
}) {
  const existing = await prisma.replySubmission.findFirst({
    where: {
      postCandidateId: input.candidateId,
      draftReplyId: input.draftReplyId,
      submissionMode: SubmissionMode.MANUAL_COPY,
      success: true
    }
  });

  if (existing) {
    return existing;
  }

  return prisma.replySubmission.create({
    data: {
      postCandidateId: input.candidateId,
      draftReplyId: input.draftReplyId,
      submissionMode: SubmissionMode.MANUAL_COPY,
      success: true
    }
  });
}
