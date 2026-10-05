import type { HostProvider } from "../hosts/types";
import { prisma } from "../db";
import { normalize } from "./normalize";

export function selectUniqueMatch<T>(items: T[]): T | null {
  return items.length === 1 ? items[0] : null;
}

export function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.\/\\]+$/, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function attachPrimaryFileToExistingVideo(
  hostId: string,
  provider: HostProvider,
  file: {
    code: string;
    title: string;
    lengthSeconds: number | null;
    thumbnailUrl: string | null;
  },
): Promise<boolean> {
  const normalizedName = normalize(file.title);

  const matches = await prisma.mirror.findMany({
    where: {
      hostId: { not: hostId },
      normalizedName,
    },
    select: {
      videoId: true,
    },
    distinct: ["videoId"],
    take: 2,
  });

  const target = selectUniqueMatch(matches);
  if (!target) return false;

  const existingOnHost = await prisma.mirror.findUnique({
    where: {
      videoId_hostId: {
        videoId: target.videoId,
        hostId,
      },
    },
    select: { id: true },
  });

  if (existingOnHost) return false;

  await prisma.mirror.create({
    data: {
      videoId: target.videoId,
      hostId,
      fileCode: file.code,
      rawTitle: file.title,
      normalizedName,
      embedUrl: provider.embedUrl(file.code),
      hostThumbnailUrl: file.thumbnailUrl,
      lengthSeconds: file.lengthSeconds,
      status: "OK",
      matchedBy: "AUTO",
      lastCheckedAt: new Date(),
    },
  });

  return true;
}

export async function autoMatchHostFiles(
  hostId: string,
  provider: HostProvider,
): Promise<number> {
  const videos = await prisma.video.findMany({
    where: {
      mirrors: {
        none: {
          hostId,
        },
      },
    },
    select: {
      id: true,
      mirrors: {
        select: {
          normalizedName: true,
        },
        take: 1,
      },
    },
  });

  let matched = 0;

  for (const video of videos) {
    const normalizedName = video.mirrors[0]?.normalizedName;
    if (!normalizedName) continue;

    const candidates = await prisma.hostFile.findMany({
      where: {
        hostId,
        normalizedName,
        ignored: false,
        linkedVideoId: null,
      },
      select: {
        id: true,
        fileCode: true,
        rawTitle: true,
      },
      take: 2,
    });

    const candidate = selectUniqueMatch(candidates);
    if (!candidate) continue;

    let info = null;
    try {
      info = await provider.getFileInfo(candidate.fileCode);
    } catch {
      // Matching must not fail just because optional host metadata is
      // temporarily unavailable. Health sync refreshes it later.
    }

    await prisma.$transaction([
      prisma.mirror.create({
        data: {
          videoId: video.id,
          hostId,
          fileCode: candidate.fileCode,
          rawTitle: info?.title ?? candidate.rawTitle,
          normalizedName,
          embedUrl: provider.embedUrl(candidate.fileCode),
          hostThumbnailUrl: info?.thumbnailUrl ?? null,
          lengthSeconds: info?.lengthSeconds ?? null,
          status: "OK",
          matchedBy: "AUTO",
          lastCheckedAt: new Date(),
        },
      }),
      prisma.hostFile.update({
        where: { id: candidate.id },
        data: { linkedVideoId: video.id },
      }),
    ]);

    matched += 1;
  }

  return matched;
}
