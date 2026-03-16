import { CandidateStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { listCandidates } from "@/lib/repositories/candidateRepository";
import { requireRouteAuth } from "@/lib/routeAuth";
import { safeParseNumber } from "@/lib/utils";

export async function GET(request: Request) {
  const auth = await requireRouteAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status");
  const search = url.searchParams.get("q")?.trim() ?? "";
  const maxAgeHours = Math.min(safeParseNumber(url.searchParams.get("maxAgeHours") ?? undefined, 24), 24);
  const status = rawStatus && rawStatus in CandidateStatus ? (rawStatus as CandidateStatus) : undefined;
  const candidates = await listCandidates({
    status,
    search,
    maxAgeHours
  });
  return NextResponse.json(candidates);
}
