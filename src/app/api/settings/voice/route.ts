import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAuth } from "@/lib/routeAuth";
import { saveVoiceExamples } from "@/lib/services/settingsService";

const voiceSchema = z.object({
  voiceExamples: z.array(
    z.object({
      label: z.string().min(1),
      sourceType: z.string().min(1),
      content: z.string().min(1),
      enabled: z.boolean()
    })
  )
});

export async function POST(request: Request) {
  const auth = await requireRouteAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = voiceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid voice payload." }, { status: 400 });
  }

  await saveVoiceExamples(parsed.data.voiceExamples);
  return NextResponse.json({ ok: true });
}
