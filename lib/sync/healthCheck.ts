import type { SyncRun } from "@prisma/client";

import { prisma } from "../db";
import { getHostProvider } from "../hosts/registry";
import { withSyncLock } from "./settings";

export type HealthJobResult = {
  run: SyncRun;
  skipped: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function shouldMarkRemoved(okMirrorCount: number): boolean {
  return okMirrorCount === 0;
}

export async function runHealthCheck(): Promise<HealthJobResult> {
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
      const provider = getHostProvider(mirror.hostId);
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

    for (const videoId of affectedVideoIds) {
      const okMirrorCount = await prisma.mirror.count({
        where: {
          videoId,
          status: "OK",
        },
      });

      if (shouldMarkRemoved(okMirrorCount)) {
        await prisma.video.updateMany({
          where: {
            id: videoId,
            status: "AVAILABLE",
          },
          data: {
            status: "REMOVED",
          },
        });
      }
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
