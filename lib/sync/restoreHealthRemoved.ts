import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { getHostProvider } from "../hosts/registry";
import type { HostProvider } from "../hosts/types";

// Brings back videos the host health check removed by mistake. Before
// removedBy existed, one health run that found no OK mirror (a 404 while Dood
// still processed an upload, or a failed API call) removed a video for good,
// and later runs never restored it: 212 videos stayed REMOVED with their Dood
// file OK. This plans (dry run) and applies the restore, skipping anything a
// person may have removed on purpose.

type Db = Pick<PrismaClient, "video" | "report" | "removalRequest" | "adminAction">;

export type RestoreRow = {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
  removedBy: string | null;
  /** Mirrors as `host:status` (DB), then the live host answer when checked. */
  mirrors: string[];
  live: string[];
  /** Why it is not restored; null means it will be. */
  skip: string | null;
};

/**
 * Only VIDEO_UPDATE (the admin video form) can set REMOVED by hand, and
 * admin actions do not record which field changed: such videos are listed
 * for a person to decide.
 */
const STATUS_EDIT_ACTIONS = ["VIDEO_UPDATE"];

export async function planHealthRestore(options: {
  checkHosts?: boolean;
  client?: Db;
  provider?: (hostId: string) => Pick<HostProvider, "getFileInfo"> | undefined;
} = {}): Promise<RestoreRow[]> {
  const client = options.client ?? prisma;
  const provider = options.provider ?? getHostProvider;
  const videos = await client.video.findMany({
    // Legacy removals (null) and the health check's own; never "admin".
    where: { status: "REMOVED", OR: [{ removedBy: null }, { removedBy: "health" }] },
    select: {
      id: true,
      slug: true,
      title: true,
      isPublished: true,
      removedBy: true,
      mirrors: { select: { hostId: true, fileCode: true, status: true } },
      _count: { select: { reports: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (videos.length === 0) return [];

  const ids = videos.map((video) => video.id);
  const [requests, actions] = await Promise.all([
    client.removalRequest.findMany({ select: { payload: true } }),
    client.adminAction.findMany({
      where: { action: { in: STATUS_EDIT_ACTIONS }, target: { in: ids } },
      select: { target: true },
    }),
  ]);
  const requestText = requests.map((request) => JSON.stringify(request.payload ?? "").toLowerCase());
  const edited = new Set(actions.map((action) => action.target));

  const rows: RestoreRow[] = [];
  for (const video of videos) {
    const row: RestoreRow = {
      id: video.id,
      slug: video.slug,
      title: video.title,
      isPublished: video.isPublished,
      removedBy: video.removedBy,
      mirrors: video.mirrors.map((mirror) => `${mirror.hostId}:${mirror.status}`),
      live: [],
      skip: null,
    };
    const slug = video.slug.toLowerCase();
    if (!video.mirrors.some((mirror) => mirror.status === "OK")) {
      row.skip = "không có mirror OK trong DB";
    } else if (requestText.some((text) => text.includes(slug) || text.includes(video.id.toLowerCase()))) {
      row.skip = "có yêu cầu gỡ (content removal) nhắc tới video";
    } else if (video._count.reports > 0) {
      row.skip = `có ${video._count.reports} báo cáo (report)`;
    } else if (edited.has(video.id)) {
      row.skip = "admin đã sửa video (VIDEO_UPDATE), có thể đã tự đặt REMOVED";
    }
    if (!row.skip && options.checkHosts !== false) {
      for (const mirror of video.mirrors) {
        const host = provider(mirror.hostId);
        if (!host) {
          row.live.push(`${mirror.hostId}:no-provider`);
          continue;
        }
        try {
          row.live.push(`${mirror.hostId}:${(await host.getFileInfo(mirror.fileCode)) ? "OK" : "MISSING"}`);
        } catch {
          row.live.push(`${mirror.hostId}:ERROR`);
        }
      }
      if (!row.live.some((answer) => answer.endsWith(":OK"))) row.skip = "host không xác nhận file còn (kiểm tra trực tiếp)";
    }
    rows.push(row);
  }
  return rows;
}

/** Restores the rows the plan cleared; re-checks the status so nothing else is touched. */
export async function applyHealthRestore(rows: RestoreRow[], client: Pick<PrismaClient, "video"> = prisma): Promise<number> {
  const ids = rows.filter((row) => !row.skip).map((row) => row.id);
  if (ids.length === 0) return 0;
  const result = await client.video.updateMany({
    where: { id: { in: ids }, status: "REMOVED", OR: [{ removedBy: null }, { removedBy: "health" }] },
    data: { status: "AVAILABLE", removedBy: null, removedAt: null },
  });
  return result.count;
}
