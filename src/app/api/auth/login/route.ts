import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateUser, createSessionToken, setSessionCookie } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login payload." }, { status: 400 });
  }

  const user = await authenticateUser(parsed.data.email, parsed.data.password);
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const token = await createSessionToken(user.id, user.email);
  const response = NextResponse.json({ ok: true });
  await setSessionCookie(response, token);
  return response;
}
