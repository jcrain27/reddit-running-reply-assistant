import { NextResponse } from "next/server";

import { requireRouteAuth } from "@/lib/routeAuth";
import { regenerateCommentReplyDraft } from "@/lib/services/commentReplyService";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRouteAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;

  try {
    const draft = await regenerateCommentReplyDraft({
      candidateId: id
    });

    return NextResponse.json({ ok: true, draftReplyId: draft.id });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Regenerate failed."
      },
      { status: 400 }
    );
  }
}
