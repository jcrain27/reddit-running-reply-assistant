import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAuth } from "@/lib/routeAuth";
import { trackManualCommentForCommentReplyCandidate } from "@/lib/services/commentReplyService";

const trackSchema = z.object({
  commentPermalink: z.string().url(),
  commentText: z.string().optional()
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
  const parsed = trackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid tracking payload." }, { status: 400 });
  }

  try {
    const tracked = await trackManualCommentForCommentReplyCandidate({
      commentReplyCandidateId: id,
      commentPermalink: parsed.data.commentPermalink,
      commentText: parsed.data.commentText
    });

    return NextResponse.json({
      ok: true,
      message: "Manual follow-up comment is now being monitored for replies.",
      trackedCommentId: tracked.id
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Tracking failed."
      },
      { status: 400 }
    );
  }
}
