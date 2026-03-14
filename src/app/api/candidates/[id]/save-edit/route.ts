import { CandidateStatus, DraftFinalAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getLatestDraft } from "@/lib/repositories/candidateRepository";
import { requireRouteAuth } from "@/lib/routeAuth";
import { recordManualCopy } from "@/lib/services/submissionService";
import {
  computeEditDistance,
  inferReplyShortened,
  inferToneSoftened
} from "@/lib/utils";

const saveEditSchema = z.object({
  humanEditedText: z.string().min(1),
  finalAction: z.enum(["NONE", "COPY"]).default("NONE")
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRouteAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = saveEditSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid edit payload." }, { status: 400 });
  }

  const latestDraft = await getLatestDraft(id);
  if (!latestDraft) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  const finalAction =
    parsed.data.finalAction === "COPY" ? DraftFinalAction.COPY : DraftFinalAction.NONE;

  await prisma.$transaction([
    prisma.draftReply.update({
      where: { id: latestDraft.id },
      data: {
        humanEditedText: parsed.data.humanEditedText,
        finalAction,
        editDistance: computeEditDistance(latestDraft.draftText, parsed.data.humanEditedText),
        replyShortened: inferReplyShortened(latestDraft.draftText, parsed.data.humanEditedText),
        toneSoftened: inferToneSoftened(latestDraft.draftText, parsed.data.humanEditedText),
        ctaRemoved:
          Boolean(latestDraft.optionalCTAText) &&
          !parsed.data.humanEditedText
            .toLowerCase()
            .includes((latestDraft.optionalCTAText ?? "").toLowerCase())
      }
    }),
    prisma.postCandidate.update({
      where: { id },
      data: {
        status:
          parsed.data.finalAction === "COPY"
            ? CandidateStatus.APPROVED
            : CandidateStatus.REVIEWED
      }
    })
  ]);

  if (parsed.data.finalAction === "COPY") {
    await recordManualCopy({
      candidateId: id,
      draftReplyId: latestDraft.id
    });
  }

  return NextResponse.json({ ok: true, message: "Draft saved." });
}
