import { NextResponse } from "next/server";

import { ensureApiSession, isCronAuthorized } from "@/lib/auth";

export async function requireRouteAuth(
  request: Request,
  options?: {
    allowCron?: boolean;
  }
) {
  const session = await ensureApiSession();
  if (session) {
    return { session };
  }

  if (options?.allowCron) {
    const cronAuthorized = await isCronAuthorized(request);
    if (cronAuthorized) {
      return { session: null };
    }
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
