"use server";

import bcrypt from "bcrypt";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/auth/rateLimit";
import { setAdminSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export type LoginState = {
  error?: string;
};

function rateLimitKey(email: string, forwardedFor: string | null): string {
  return `${forwardedFor ?? "unknown"}:${email.toLowerCase()}`;
}

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const headerStore = await headers();
  const key = rateLimitKey(
    parsed.data.email,
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  );
  const limit = checkLoginRateLimit(key);

  if (!limit.allowed) {
    return {
      error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
    };
  }

  const admin = await db.adminUser.findFirst({
    where: {
      email: parsed.data.email.toLowerCase(),
    },
  });

  const valid =
    admin &&
    (await bcrypt.compare(parsed.data.password, admin.passwordHash));

  if (!admin || !valid) {
    recordLoginFailure(key);
    return { error: "Invalid email or password." };
  }

  clearLoginFailures(key);
  await setAdminSession(admin.id);
  await writeAdminAudit(admin.id, "LOGIN", "admin-session");
  redirect("/admin");
}
