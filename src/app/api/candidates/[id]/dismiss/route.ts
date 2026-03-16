import { CandidateStatus, DraftFinalAction } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getLatestDraft } from "@/lib/repositories/candidateRepository";
import { requireRouteAuth } from "@/lib/routeAuth";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRouteAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  const latestDraft = await getLatestDraft(id);

  await prisma.$transaction([
    prisma.postCandidate.update({
      where: { id },
      data: { status: CandidateStatus.ARCHIVED }
    }),
    ...(latestDraft
      ? [
          prisma.draftReply.update({
            where: { id: latestDraft.id },
            data: { finalAction: DraftFinalAction.ARCHIVE }
          })
        ]
      : [])
  ]);

  return NextResponse.json({ ok: true, message: "Dismissed." });
}
