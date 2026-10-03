import cron from "node-cron";

import { prisma } from "../lib/db";
import { runHealthCheck } from "../lib/sync/healthCheck";
import { runNewVideos } from "../lib/sync/newVideos";
import { getSyncSettings } from "../lib/sync/settings";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export function isDue(
  lastRunAt: Date | null,
  intervalMs: number,
  now = new Date(),
): boolean {
  return !lastRunAt || now.getTime() - lastRunAt.getTime() >= intervalMs;
}

export async function processSyncRequests(): Promise<void> {
  const requests = await prisma.syncRequest.findMany({
    where: { handledAt: null },
    orderBy: { requestedAt: "asc" },
    take: 20,
  });

  for (const request of requests) {
    const result =
      request.kind === "NEW"
        ? await runNewVideos()
        : await runHealthCheck();

    if (!result.skipped) {
      await prisma.syncRequest.update({
        where: { id: request.id },
        data: { handledAt: new Date() },
      });
    }
  }
}

export async function runScheduledSync(now = new Date()): Promise<void> {
  const settings = await getSyncSettings();
  const [lastNew, lastHealth] = await Promise.all([
    prisma.syncRun.findFirst({
      where: { kind: "NEW", finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
    prisma.syncRun.findFirst({
      where: { kind: "HEALTH", finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
  ]);

  if (
    isDue(
      lastNew?.finishedAt ?? null,
      settings.newIntervalMinutes * MINUTE_MS,
      now,
    )
  ) {
    await runNewVideos();
  }

  if (
    isDue(
      lastHealth?.finishedAt ?? null,
      settings.healthIntervalHours * HOUR_MS,
      now,
    )
  ) {
    await runHealthCheck();
  }
}

export async function workerTick(now = new Date()): Promise<void> {
  await processSyncRequests();
  await runScheduledSync(now);
}

export function startWorker(): void {
  void workerTick().catch((error) => {
    console.error("Initial sync worker tick failed", error);
  });

  cron.schedule("* * * * *", () => {
    void workerTick().catch((error) => {
      console.error("Sync worker tick failed", error);
    });
  });
}

if (process.env.NODE_ENV !== "test") {
  startWorker();
}
