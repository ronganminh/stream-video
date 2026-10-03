import type { Prisma } from "@prisma/client";

import { prisma } from "../../db";
import type { Category, ListQuery, Tag } from "../../types";
import { getFilteredVideoPage } from "./lists";
import { withPublicVisibility } from "./visibility";

function categoryFromRow(
  row: {
    slug: string;
    name: string;
    description: string | null;
    group: string;
    thumbnailPath: string | null;
    trending: boolean;
  },
  count: number,
): Category {
  return {
    slug: row.slug,
    name: row.name,
    count,
    thumbnailUrl: row.thumbnailPath,
    group: row.group,
    trending: row.trending || undefined,
    description: row.description ?? undefined,
  };
}

async function visibleTagCounts(
  extraWhere: Prisma.VideoWhereInput = {},
  excludeTagId?: string,
): Promise<Tag[]> {
  const visibleVideos = await prisma.video.findMany({
    where: withPublicVisibility(extraWhere),
    select: { id: true },
  });

  if (visibleVideos.length === 0) return [];

  const grouped = await prisma.videoTag.groupBy({
    by: ["tagId"],
    where: {
      videoId: { in: visibleVideos.map((video) => video.id) },
      ...(excludeTagId ? { tagId: { not: excludeTagId } } : {}),
    },
    _count: {
      _all: true,
    },
  });

  if (grouped.length === 0) return [];

  const tagRows = await prisma.tag.findMany({
    where: { id: { in: grouped.map((row) => row.tagId) } },
    select: { id: true, slug: true, name: true },
  });
  const counts = new Map(grouped.map((row) => [row.tagId, row._count._all]));

  return tagRows
    .map((tag) => ({
      slug: tag.slug,
      name: tag.name,
      count: counts.get(tag.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getPopularTagsPrisma(
  limit = 12,
  extraWhere: Prisma.VideoWhereInput = {},
  excludeTagId?: string,
): Promise<Tag[]> {
  return (await visibleTagCounts(extraWhere, excludeTagId)).slice(0, limit);
}

export async function getCategoriesPrisma(): Promise<Category[]> {
  const [rows, grouped] = await Promise.all([
    prisma.category.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        group: true,
        thumbnailPath: true,
        trending: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.video.groupBy({
      by: ["categoryId"],
      where: withPublicVisibility({ categoryId: { not: null } }),
      _count: {
        _all: true,
      },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const group of grouped) {
    if (group.categoryId) counts.set(group.categoryId, group._count._all);
  }

  return rows.map((row) => categoryFromRow(row, counts.get(row.id) ?? 0));
}

export async function getCategoryPrisma(slug: string, query: ListQuery = {}) {
  const category = await prisma.category.findFirst({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      group: true,
      thumbnailPath: true,
      trending: true,
    },
  });

  if (!category) return null;

  const baseWhere: Prisma.VideoWhereInput = { categoryId: category.id };
  const [videos, count, relatedTags] = await Promise.all([
    getFilteredVideoPage(query, `/category/${slug}`, {
      extraWhere: baseWhere,
    }),
    prisma.video.count({ where: withPublicVisibility(baseWhere) }),
    getPopularTagsPrisma(8, baseWhere),
  ]);

  return {
    category: categoryFromRow(category, count),
    videos,
    relatedTags,
  };
}

export async function getTagPrisma(slug: string, query: ListQuery = {}) {
  const tag = await prisma.tag.findFirst({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });

  if (!tag) return null;

  const baseWhere: Prisma.VideoWhereInput = {
    videoTags: {
      some: {
        tagId: tag.id,
      },
    },
  };

  const [videos, count, relatedTags] = await Promise.all([
    getFilteredVideoPage(query, `/tag/${slug}`, {
      extraWhere: baseWhere,
      defaultSort: "tag",
    }),
    prisma.video.count({ where: withPublicVisibility(baseWhere) }),
    getPopularTagsPrisma(7, baseWhere, tag.id),
  ]);

  return {
    tag: {
      slug: tag.slug,
      name: tag.name,
      count,
    },
    videos,
    relatedTags,
  };
}
