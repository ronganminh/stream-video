import { randomUUID } from "node:crypto";

import type { SyncKind } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { prisma } from "../db";

export const SYNC_SETTING_KEYS = {
  newIntervalMinutes: "syncNewIntervalMinutes",
  healthIntervalHours: "syncHealthIntervalHours",
  autoMatchEnabled: "syncAutoMatchEnabled",
} as const;

export type SyncSettings = {
  newIntervalMinutes: number;
  healthIntervalHours: number;
  autoMatchEnabled: boolean;
};

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  newIntervalMinutes: 15,
  healthIntervalHours: 24,
  autoMatchEnabled: true,
};

// Each sync kind gets its own lock row so a NEW run can never block a HEALTH
// run (and vice versa).
const LOCK_KEYS: Record<SyncKind, string> = {
  NEW: "syncLock:NEW",
  HEALTH: "syncLock:HEALTH",
};

// Safety lease: a lock this old is treated as abandoned and can be taken over.
// This self-heals a holder that crashed or was killed mid-run, so the sync can
// never jam indefinitely. Keep it comfortably above a normal sync's duration.
const LOCK_TTL_MS = 15 * 60_000;

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseSyncSettings(
  values: Record<string, unknown>,
): SyncSettings {
  return {
    newIntervalMinutes: positiveNumber(
      values[SYNC_SETTING_KEYS.newIntervalMinutes],
      DEFAULT_SYNC_SETTINGS.newIntervalMinutes,
    ),
    healthIntervalHours: positiveNumber(
      values[SYNC_SETTING_KEYS.healthIntervalHours],
      DEFAULT_SYNC_SETTINGS.healthIntervalHours,
    ),
    autoMatchEnabled: booleanValue(
      values[SYNC_SETTING_KEYS.autoMatchEnabled],
      DEFAULT_SYNC_SETTINGS.autoMatchEnabled,
    ),
  };
}

export async function getSyncSettings(): Promise<SyncSettings> {
  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: Object.values(SYNC_SETTING_KEYS),
      },
    },
    select: {
      key: true,
      value: true,
    },
  });

  return parseSyncSettings(
    Object.fromEntries(rows.map((row) => [row.key, row.value])),
  );
}

// A durable, connection-agnostic lease lock stored in the Setting table.
//
// We previously used pg_try_advisory_lock/pg_advisory_unlock, but those locks
// are bound to the Postgres session (connection). Prisma runs each query on an
// arbitrary pooled connection, so the unlock could land on a different
// connection than the one that acquired the lock. When that happened the unlock
// was a no-op and the advisory lock leaked onto an idle pooled connection,
// jamming every future sync with "Another sync run is already active" until the
// worker restarted.
//
// The lease is claimed with a single atomic INSERT ... ON CONFLICT that only
// takes over a row whose lease has expired, so concurrent workers can never both
// hold it. Release is scoped by a per-acquire token so we only ever clear our
// own lease, never one another worker legitimately took over after ours expired.
export async function withSyncLock<T>(
  kind: SyncKind,
  operation: () => Promise<T>,
): Promise<{ acquired: boolean; value?: T }> {
  const key = LOCK_KEYS[kind];
  const token = randomUUID();
  const until = new Date(Date.now() + LOCK_TTL_MS).toISOString();
  const payload = JSON.stringify({ token, until });

  const claimed = await prisma.$queryRaw<Array<{ key: string }>>(
    Prisma.sql`
      INSERT INTO "Setting" (key, value)
      VALUES (${key}, ${payload}::jsonb)
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value
        WHERE ("Setting".value ->> 'until')::timestamptz < now()
      RETURNING key
    `,
  );

  if (claimed.length === 0) {
    return { acquired: false };
  }

  try {
    return {
      acquired: true,
      value: await operation(),
    };
  } finally {
    await prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM "Setting"
        WHERE key = ${key} AND value ->> 'token' = ${token}
      `,
    );
  }
}
