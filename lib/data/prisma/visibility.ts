import type { Prisma } from "@prisma/client";

import type { VideoCard } from "../../types";

export const PUBLIC_VIDEO_WHERE: Prisma.VideoWhereInput = {
  isPublished: true,
  isHidden: false,
  status: "AVAILABLE",
  mirrors: {
    some: {
      status: "OK",
    },
  },
};

export const VIDEO_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  thumbnailPath: true,
  durationSeconds: true,
  views: true,
  publishedAt: true,
  createdAt: true,
  quality: true,
  status: true,
  hotOverride: true,
} satisfies Prisma.VideoSelect;

export type VideoCardRow = Prisma.VideoGetPayload<{
  select: typeof VIDEO_CARD_SELECT;
}>;

export function withPublicVisibility(
  where: Prisma.VideoWhereInput = {},
): Prisma.VideoWhereInput {
  return {
    AND: [PUBLIC_VIDEO_WHERE, where],
  };
}

export function toVideoCard(
  row: VideoCardRow,
  overrides: {
    views?: number;
    hot?: boolean;
  } = {},
): VideoCard {
  const card: VideoCard = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    thumbnailUrl: row.thumbnailPath,
    durationSeconds: row.durationSeconds,
    views: overrides.views ?? row.views,
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    availability: row.status,
  };

  if (row.quality === "4K" || row.quality === "HD") {
    card.quality = row.quality;
  }

  if (overrides.hot ?? row.hotOverride) {
    card.hot = true;
  }

  return card;
}
