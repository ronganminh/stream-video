import { prisma } from "../db";
import {
  loadMigrationEntriesByHostCode,
  tagConnectData,
} from "./migrationMetadata";
import { applySourceThumbnail } from "./thumbnailSources";

export type BackfillResult = {
  scanned: number;
  titled: number;
  tagged: number;
  thumbnailed: number;
  errors: string[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Repair migrated videos that were imported before their CSV metadata was
// available (tags/source thumbnail/title missing). Idempotent: skips tags that
// already exist, only retitles unpublished drafts, and applySourceThumbnail
// respects an admin's explicit host-thumbnail choice.
export async function runBackfill(): Promise<BackfillResult> {
  const errors: string[] = [];
  let titled = 0;
  let tagged = 0;
  let thumbnailed = 0;

  const primary = await prisma.host.findFirst({
    where: { enabled: true, isPrimary: true },
    select: { id: true },
  });
  if (!primary) {
    return { scanned: 0, titled, tagged, thumbnailed, errors: ["no primary host"] };
  }

  const entries = await loadMigrationEntriesByHostCode(primary.id);
  if (entries.size === 0) {
    return {
      scanned: 0,
      titled,
      tagged,
      thumbnailed,
      errors: ["no migration entries (CSV missing or empty)"],
    };
  }

  const mirrors = await prisma.mirror.findMany({
    where: { hostId: primary.id, fileCode: { in: [...entries.keys()] } },
    select: { videoId: true, fileCode: true },
  });

  for (const mirror of mirrors) {
    const entry = entries.get(mirror.fileCode);
    if (!entry) continue;

    const video = await prisma.video.findUnique({
      where: { id: mirror.videoId },
      select: {
        id: true,
        title: true,
        isPublished: true,
        videoTags: { select: { tagId: true } },
      },
    });
    if (!video) continue;

    try {
      if (!video.isPublished && entry.title && entry.title !== video.title) {
        await prisma.video.update({
          where: { id: video.id },
          data: { title: entry.title },
        });
        titled += 1;
      }

      if (entry.tags.length > 0) {
        const links = await tagConnectData(entry.tags);
        const existing = new Set(video.videoTags.map((row) => row.tagId));
        const toAdd = links.filter((link) => !existing.has(link.tagId));
        if (toAdd.length > 0) {
          await prisma.video.update({
            where: { id: video.id },
            data: { videoTags: { create: toAdd } },
          });
          tagged += 1;
        }
      }

      if (entry.sourceThumbnailUrl) {
        await applySourceThumbnail(video.id, entry.sourceThumbnailUrl);
        thumbnailed += 1;
      }
    } catch (error) {
      errors.push(`${mirror.fileCode}: ${errorMessage(error)}`);
    }
  }

  return { scanned: mirrors.length, titled, tagged, thumbnailed, errors };
}
