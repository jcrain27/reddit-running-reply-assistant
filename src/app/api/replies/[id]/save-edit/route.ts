import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAuth } from "@/lib/routeAuth";
import { saveCommentReplyEdit } from "@/lib/services/commentReplyService";

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

  try {
    await saveCommentReplyEdit({
      candidateId: id,
      humanEditedText: parsed.data.humanEditedText,
      finalAction: parsed.data.finalAction
    });

    return NextResponse.json({ ok: true, message: "Draft saved." });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Save failed."
      },
      { status: 400 }
    );
  }
}
