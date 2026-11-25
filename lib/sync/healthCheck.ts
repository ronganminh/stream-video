import type { SyncRun } from "@prisma/client";

import { prisma } from "../db";
import { getHostProvider } from "../hosts/registry";
import type { HostProvider } from "../hosts/types";
import { withSyncLock } from "./settings";

export type HealthJobResult = {
  run: SyncRun;
  skipped: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Health checks in a row that must find a file missing before it counts as gone. */
export const MISSING_RUNS_TO_REMOVE = 2;

type MirrorHealth = { status: string; missingStreak: number };

/**
 * A video is removed only when every mirror was found missing on the host
 * MISSING_RUNS_TO_REMOVE times in a row. A failed API call (ERROR: rate
 * limit, timeout, host outage) says nothing about the file and never counts;
 * neither does a single 404 (Dood answers 404 while a new upload is still
 * processing). Before this, one bad run removed videos for good: 212 videos
 * stayed REMOVED with their Dood file OK (November 2026).
 */
export function shouldMarkRemoved(mirrors: MirrorHealth[]): boolean {
  return (
    mirrors.length > 0 &&
    mirrors.every((mirror) => mirror.status === "MISSING" && mirror.missingStreak >= MISSING_RUNS_TO_REMOVE)
  );
}

/** A video this health check removed comes back as soon as a mirror is OK. */
export function shouldRestore(
  video: { status: string; removedBy: string | null },
  mirrors: MirrorHealth[],
): boolean {
  return video.status === "REMOVED" && video.removedBy === "health" && mirrors.some((mirror) => mirror.status === "OK");
}

export async function runHealthCheck(
  options: {
    /** Tests: check only these videos' mirrors, with this provider lookup. */
    videoIds?: string[];
    provider?: (hostId: string) => HostProvider | undefined;
  } = {},
): Promise<HealthJobResult> {
  const providerFor = options.provider ?? getHostProvider;
  const run = await prisma.syncRun.create({
    data: {
      kind: "HEALTH",
      created: 0,
      matched: 0,
      missing: 0,
      errors: [],
    },
  });

  const locked = await withSyncLock("HEALTH", async () => {
    const errors: string[] = [];
    let missing = 0;

    const mirrors = await prisma.mirror.findMany({
      where: options.videoIds ? { videoId: { in: options.videoIds } } : undefined,
      include: {
        host: {
          select: {
            id: true,
            isPrimary: true,
          },
        },
      },
    });

    const affectedVideoIds = new Set<string>();

    for (const mirror of mirrors) {
      const provider = providerFor(mirror.hostId);
      if (!provider) {
        errors.push(`No provider registered for host ${mirror.hostId}`);
        continue;
      }

      try {
        const info = await provider.getFileInfo(mirror.fileCode);
        const status = info ? "OK" : "MISSING";
        if (!info) missing += 1;

        await prisma.mirror.update({
          where: { id: mirror.id },
          data: {
            status,
            missingStreak: info ? 0 : mirror.missingStreak + 1,
            lastCheckedAt: new Date(),
            hostThumbnailUrl: info?.thumbnailUrl ?? mirror.hostThumbnailUrl,
            lengthSeconds: info?.lengthSeconds ?? mirror.lengthSeconds,
            rawTitle: info?.title ?? mirror.rawTitle,
            embedUrl: info
              ? provider.embedUrl(info.code)
              : mirror.embedUrl,
          },
        });

        affectedVideoIds.add(mirror.videoId);
      } catch (error) {
        errors.push(
          `${mirror.hostId} file ${mirror.fileCode}: ${errorMessage(error)}`,
        );
        await prisma.mirror.update({
          where: { id: mirror.id },
          data: {
            status: "ERROR",
            lastCheckedAt: new Date(),
          },
        });
        affectedVideoIds.add(mirror.videoId);
      }
    }

    let removed = 0;
    let restored = 0;
    for (const videoId of affectedVideoIds) {
      const [video, videoMirrors] = await Promise.all([
        prisma.video.findUnique({ where: { id: videoId }, select: { status: true, removedBy: true } }),
        prisma.mirror.findMany({ where: { videoId }, select: { status: true, missingStreak: true } }),
      ]);
      if (!video) continue;

      if (video.status === "AVAILABLE" && shouldMarkRemoved(videoMirrors)) {
        const result = await prisma.video.updateMany({
          where: { id: videoId, status: "AVAILABLE" },
          data: { status: "REMOVED", removedBy: "health", removedAt: new Date() },
        });
        removed += result.count;
      } else if (shouldRestore(video, videoMirrors)) {
        // Only the health check's own removals: never an admin's or a
        // takedown's (removedBy "admin" or unknown).
        const result = await prisma.video.updateMany({
          where: { id: videoId, status: "REMOVED", removedBy: "health" },
          data: { status: "AVAILABLE", removedBy: null, removedAt: null },
        });
        restored += result.count;
      }
    }
    if (removed > 0 || restored > 0) {
      console.info(`HEALTH: removed=${removed} restored=${restored} (removedBy=health)`);
    }

    const primary = await prisma.host.findFirst({
      where: { isPrimary: true },
      select: { id: true },
    });

    if (primary) {
      const primaryMissing = await prisma.mirror.count({
        where: {
          hostId: primary.id,
          status: "MISSING",
        },
      });
      if (primaryMissing > 0) {
        errors.push(
          `${primaryMissing} video mirror(s) missing on primary host ${primary.id}`,
        );
      }
    }

    return { missing, errors };
  });

  if (!locked.acquired || !locked.value) {
    const finished = await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        errors: ["Another sync run is already active"],
      },
    });
    return { run: finished, skipped: true };
  }

  const finished = await prisma.syncRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      missing: locked.value.missing,
      errors: locked.value.errors,
    },
  });

  return { run: finished, skipped: false };
}
