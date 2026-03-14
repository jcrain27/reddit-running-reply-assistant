import { NextResponse } from "next/server";

import { requireRouteAuth } from "@/lib/routeAuth";
import { getAnalyticsSummary } from "@/lib/services/analyticsService";

export async function GET(request: Request) {
  const auth = await requireRouteAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const analytics = await getAnalyticsSummary();
  return NextResponse.json(analytics);
}
