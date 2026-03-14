import { NextResponse } from "next/server";

import { requireRouteAuth } from "@/lib/routeAuth";
import { runScanJob } from "@/lib/services/scanService";

export async function POST(request: Request) {
  const auth = await requireRouteAuth(request, { allowCron: true });
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const result = await runScanJob(auth.session ? "manual" : "cron");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Scan failed."
      },
      { status: 500 }
    );
  }
}
