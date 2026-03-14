import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAuth } from "@/lib/routeAuth";
import { submitApprovedCommentReply } from "@/lib/services/commentReplyService";

const submitSchema = z.object({
  draftReplyId: z.string().min(1),
  replyText: z.string().min(1)
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
  const parsed = submitSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submit payload." }, { status: 400 });
  }

  try {
    const result = await submitApprovedCommentReply({
      candidateId: id,
      draftId: parsed.data.draftReplyId,
      replyText: parsed.data.replyText
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Submit failed."
      },
      { status: 400 }
    );
  }
}
