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

const LOCK_KEYS: Record<SyncKind, number> = {
  NEW: 7_151_500,
  HEALTH: 7_151_500,
};

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

export async function withSyncLock<T>(
  kind: SyncKind,
  operation: () => Promise<T>,
): Promise<{ acquired: boolean; value?: T }> {
  const key = LOCK_KEYS[kind];
  const rows = await prisma.$queryRaw<Array<{ locked: boolean }>>(
    Prisma.sql`SELECT pg_try_advisory_lock(${key}) AS locked`,
  );

  if (!rows[0]?.locked) {
    return { acquired: false };
  }

  try {
    return {
      acquired: true,
      value: await operation(),
    };
  } finally {
    await prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_unlock(${key})`,
    );
  }
}
