import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";

export const ADMIN_SESSION_COOKIE = "gv_admin_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

type SessionPayload = {
  adminId: string;
  expiresAt: number;
};

function sessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is required");
  }
  return secret;
}

function encode(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decode(value: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;

    if (
      typeof parsed.adminId !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    return {
      adminId: parsed.adminId,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function signature(value: string): string {
  return createHmac("sha256", sessionSecret())
    .update(value)
    .digest("base64url");
}

export function createAdminSessionToken(
  adminId: string,
  now = Date.now(),
): string {
  const payload = encode({
    adminId,
    expiresAt: now + SESSION_TTL_SECONDS * 1_000,
  });
  return `${payload}.${signature(payload)}`;
}

export function verifyAdminSessionToken(
  token: string,
  now = Date.now(),
): SessionPayload | null {
  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) return null;

  const expectedSignature = signature(payload);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);

  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  const session = decode(payload);
  if (!session || session.expiresAt <= now) return null;
  return session;
}

export async function setAdminSession(adminId: string): Promise<void> {
  const store = await cookies();
  store.set(
    ADMIN_SESSION_COOKIE,
    createAdminSessionToken(adminId),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/admin",
      maxAge: SESSION_TTL_SECONDS,
    },
  );
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 0,
  });
}

export async function getCurrentAdmin() {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = verifyAdminSessionToken(token);
  if (!session) return null;

  return db.adminUser.findUnique({
    where: { id: session.adminId },
    select: {
      id: true,
      email: true,
    },
  });
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
