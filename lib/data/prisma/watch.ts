import { prisma } from "../../db";
import type { MirrorPublic, VideoCard, VideoPage } from "../../types";
import {
  VIDEO_CARD_SELECT,
  toVideoCard,
  withPublicVisibility,
} from "./visibility";

async function publicCards(
  where: Parameters<typeof withPublicVisibility>[0],
  take: number,
  orderBy: Array<Record<string, "asc" | "desc">>,
): Promise<VideoCard[]> {
  const rows = await prisma.video.findMany({
    where: withPublicVisibility(where),
    select: VIDEO_CARD_SELECT,
    orderBy,
    take,
  });

  return rows.map((row) => toVideoCard(row));
}

export async function getWatchPrisma(slug: string) {
  const row = await prisma.video.findFirst({
    where: {
      slug,
      isPublished: true,
      isHidden: false,
    },
    include: {
      category: {
        select: {
          slug: true,
          name: true,
        },
      },
      videoTags: {
        include: {
          tag: {
            select: {
              slug: true,
              name: true,
            },
          },
        },
      },
      mirrors: {
        where: {
          status: "OK",
          host: {
            is: {
              enabled: true,
            },
          },
        },
        include: {
          host: {
            select: {
              id: true,
              label: true,
              sortOrder: true,
            },
          },
        },
        orderBy: {
          host: {
            sortOrder: "asc",
          },
        },
      },
    },
  });

  if (!row) return null;

  const [upNext, relatedByCategory, popularNow] = await Promise.all([
    publicCards(
      { id: { not: row.id } },
      8,
      [{ publishedAt: "desc" }, { createdAt: "desc" }],
    ),
    row.categoryId
      ? publicCards(
          {
            id: { not: row.id },
            categoryId: row.categoryId,
          },
          8,
          [{ views: "desc" }, { publishedAt: "desc" }],
        )
      : Promise.resolve([]),
    publicCards(
      { id: { not: row.id } },
      5,
      [{ views: "desc" }, { publishedAt: "desc" }],
    ),
  ]);

  const relatedIds = new Set(relatedByCategory.map((video) => video.id));
  const related = [...relatedByCategory];

  if (related.length < 8) {
    for (const video of upNext) {
      if (related.length >= 8) break;
      if (relatedIds.has(video.id)) continue;
      related.push(video);
      relatedIds.add(video.id);
    }
  }

  const video: VideoPage = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    thumbnailUrl: row.thumbnailPath,
    durationSeconds: row.durationSeconds,
    views: row.views,
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    availability: row.status,
    description: row.description ?? "",
    category: row.category ?? {
      slug: "uncategorized",
      name: "Uncategorized",
    },
    tags: row.videoTags.map(({ tag }) => tag),
    likes: row.likes,
    upNext,
    related,
    popularNow,
  };

  if (row.quality === "4K" || row.quality === "HD") {
    video.quality = row.quality;
  }

  if (row.hotOverride) {
    video.hot = true;
  }

  const mirrors: MirrorPublic[] = row.mirrors.map((mirror) => ({
    hostId: mirror.host.id,
    label: mirror.host.label,
    embedUrl: mirror.embedUrl,
  }));

  return {
    video,
    mirrors,
  };
}
