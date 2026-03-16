import { PreferenceSignal } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAuth } from "@/lib/routeAuth";
import { saveCandidatePreference } from "@/lib/services/preferenceService";

const preferenceSchema = z.object({
  signal: z.nativeEnum(PreferenceSignal)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRouteAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = preferenceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preference payload." }, { status: 400 });
  }

  const { id } = await context.params;
  const feedback = await saveCandidatePreference(id, parsed.data.signal);

  return NextResponse.json({ ok: true, signal: feedback.signal });
}
