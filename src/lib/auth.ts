import { createHmac, timingSafeEqual } from "node:crypto";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

const SESSION_COOKIE_NAME = "rrra_session";

interface SessionPayload {
  userId: string;
  email: string;
  issuedAt: string;
}

function sign(value: string): string {
  const env = getEnv();
  return createHmac("sha256", env.SESSION_SECRET).update(value).digest("hex");
}

function encode(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, "utf8").toString("base64url");
  const signature = sign(body);
  return `${body}.${signature}`;
}

function decode(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = sign(body);
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
}

export async function authenticateUser(email: string, password: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return null;
  }

  return user;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function createSessionToken(userId: string, email: string): Promise<string> {
  return encode({
    userId,
    email,
    issuedAt: new Date().toISOString()
  });
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = decode(token);
  if (!payload) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true
    }
  });

  return user;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function ensureApiSession() {
  const session = await getSession();
  if (!session) {
    return null;
  }

  return session;
}

export async function isCronAuthorized(request: Request): Promise<boolean> {
  const env = getEnv();
  const headerValue =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!env.CRON_SECRET || !headerValue) {
    return false;
  }

  return headerValue === env.CRON_SECRET;
}

export async function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0)
  });
}
