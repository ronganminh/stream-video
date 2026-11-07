import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { db } from "../db";

// Bearer tokens for the publish API. A token is "gv_" + 32 random bytes
// (base64url); only its SHA-256 is stored, so a database leak does not leak
// usable tokens. Tokens act as the admin they belong to.

const TOKEN_PREFIX = "gv_";

export function generateApiToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** The token from an "Authorization: Bearer gv_…" header, if well formed. */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(gv_[A-Za-z0-9_-]{43})\s*$/.exec(header ?? "");
  return match ? match[1] : null;
}

export type ApiActor = { tokenId: string; tokenName: string; adminId: string };

/** The active token's owner, or null for a missing/unknown/revoked token. */
export async function authenticateApiToken(
  header: string | null,
  client: PrismaClient = db,
): Promise<ApiActor | null> {
  const token = bearerToken(header);
  if (!token) return null;

  // Looked up by hash (a unique index), so there is no secret comparison to
  // time: an attacker can't learn a prefix from response times.
  const row = await client.apiToken.findUnique({
    where: { tokenHash: hashApiToken(token) },
    select: { id: true, name: true, adminId: true, revokedAt: true },
  });
  if (!row || row.revokedAt) return null;

  await client.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { tokenId: row.id, tokenName: row.name, adminId: row.adminId };
}
