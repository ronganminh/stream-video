import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { prisma } from "../db";
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from "../thumbnailSize";
import { resolveMediaDir, toThumbnailWebp, writeThumbnail } from "./thumbnails";

// Only files this app wrote: /media/<safe name>.webp, optionally versioned.
const MEDIA_PATH = /^\/media\/([A-Za-z0-9_-]+\.webp)(?:\?v=[0-9a-f]+)?$/;
const VERSIONED = /\?v=[0-9a-f]+$/;

export type ResizeOutcome = "resized" | "versioned" | "unchanged";

export function mediaFilename(thumbnailPath: string): string | null {
  return MEDIA_PATH.exec(thumbnailPath)?.[1] ?? null;
}

// Bring one stored thumbnail to the current 640x360 WebP format. Files that
// already have the right size are not re-encoded (no generation loss); they
// only gain a content-versioned URL if they lack one.
export async function resizeStoredThumbnail(
  thumbnailPath: string,
  options: { mediaDir?: string; dryRun?: boolean } = {},
): Promise<{ outcome: ResizeOutcome; thumbnailPath: string }> {
  const filename = mediaFilename(thumbnailPath);
  if (!filename) {
    throw new Error(`not a managed /media thumbnail: ${thumbnailPath}`);
  }

  const file = path.join(resolveMediaDir(options.mediaDir), filename);
  const current = await readFile(file);
  const metadata = await sharp(current).metadata();
  const fits =
    metadata.format === "webp" &&
    metadata.width === THUMBNAIL_WIDTH &&
    metadata.height === THUMBNAIL_HEIGHT;

  if (fits) {
    if (VERSIONED.test(thumbnailPath)) {
      return { outcome: "unchanged", thumbnailPath };
    }
    const version = createHash("sha256").update(current).digest("hex").slice(0, 12);
    return { outcome: "versioned", thumbnailPath: `/media/${filename}?v=${version}` };
  }

  if (options.dryRun) {
    return { outcome: "resized", thumbnailPath };
  }

  const output = await toThumbnailWebp(current);
  return {
    outcome: "resized",
    thumbnailPath: await writeThumbnail(output, filename, options.mediaDir),
  };
}

export type MediaResizeResult = {
  scanned: number;
  resized: number;
  versioned: number;
  unchanged: number;
  errors: string[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// One-off repair for thumbnails stored before the 640x360 pipeline: video and
// category images that backfill does not regenerate (host-picked or non-CSV).
export async function runMediaResize(
  options: { mediaDir?: string; dryRun?: boolean } = {},
): Promise<MediaResizeResult> {
  const [videos, categories] = await Promise.all([
    prisma.video.findMany({
      where: { thumbnailPath: { startsWith: "/media/" } },
      select: { id: true, thumbnailPath: true },
    }),
    prisma.category.findMany({
      where: { thumbnailPath: { startsWith: "/media/" } },
      select: { id: true, thumbnailPath: true },
    }),
  ]);

  const records = [
    ...videos.map((row) => ({ kind: "video" as const, ...row })),
    ...categories.map((row) => ({ kind: "category" as const, ...row })),
  ];
  const result: MediaResizeResult = {
    scanned: records.length,
    resized: 0,
    versioned: 0,
    unchanged: 0,
    errors: [],
  };

  for (const record of records) {
    const previous = record.thumbnailPath as string;
    try {
      const { outcome, thumbnailPath } = await resizeStoredThumbnail(previous, options);
      result[outcome] += 1;
      if (options.dryRun || thumbnailPath === previous) continue;

      // Only swap the URL if nobody replaced the thumbnail meanwhile.
      const where = { id: record.id, thumbnailPath: previous };
      const data = { thumbnailPath };
      if (record.kind === "video") {
        await prisma.video.updateMany({ where, data });
      } else {
        await prisma.category.updateMany({ where, data });
      }
    } catch (error) {
      result.errors.push(`${record.kind} ${record.id}: ${errorMessage(error)}`);
    }
  }

  return result;
}
