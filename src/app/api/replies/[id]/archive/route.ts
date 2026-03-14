import { NextResponse } from "next/server";

import { requireRouteAuth } from "@/lib/routeAuth";
import { archiveCommentReplyCandidate } from "@/lib/services/commentReplyService";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRouteAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  await archiveCommentReplyCandidate(id);
  return NextResponse.json({ ok: true, message: "Archived." });
}
