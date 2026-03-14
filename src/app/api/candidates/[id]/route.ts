import { NextResponse } from "next/server";

import { getCandidateDetail } from "@/lib/repositories/candidateRepository";
import { requireRouteAuth } from "@/lib/routeAuth";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRouteAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  const candidate = await getCandidateDetail(id);

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  return NextResponse.json(candidate);
}
