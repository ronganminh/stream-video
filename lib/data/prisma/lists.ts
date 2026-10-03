import type { Prisma } from "@prisma/client";

import { prisma } from "../../db";
import type { ListPage, ListQuery, VideoCard } from "../../types";
import {
  VIDEO_CARD_SELECT,
  toVideoCard,
  withPublicVisibility,
} from "./visibility";

export const PAGE_SIZE = 20;

type DefaultSort = "newest" | "tag";
type StatsWindow = "today" | "week" | "month" | "all";

export function normalizePage(page?: number): number {
  return Number.isInteger(page) && (page ?? 0) > 0 ? (page as number) : 1;
}

function buildHref(path: string, targetPage: number, query: ListQuery): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (key === "page" || value === undefined || value === "") continue;
    params.set(key, String(value));
  }

  params.set("page", String(targetPage));
  return `${path}?${params.toString()}`;
}

function makeListPage(
  items: VideoCard[],
  total: number,
  page: number,
  path: string,
  query: ListQuery,
): ListPage {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    nextHref: page < totalPages ? buildHref(path, page + 1, query) : undefined,
    prevHref: page > 1 ? buildHref(path, page - 1, query) : undefined,
  };
}

function publicationStart(dateFilter?: string): Date | null {
  const now = Date.now();

  if (dateFilter === "today") return new Date(now - 24 * 60 * 60 * 1_000);
  if (dateFilter === "week") return new Date(now - 7 * 24 * 60 * 60 * 1_000);
  if (dateFilter === "month") return new Date(now - 30 * 24 * 60 * 60 * 1_000);

  return null;
}

function queryWhere(query: ListQuery): Prisma.VideoWhereInput {
  const filters: Prisma.VideoWhereInput[] = [];

  if (query.category) {
    filters.push({
      category: {
        is: {
          slug: query.category,
        },
      },
    });
  }

  if (query.duration === "under-5") {
    filters.push({ durationSeconds: { lt: 300 } });
  } else if (query.duration === "5-15") {
    filters.push({ durationSeconds: { gte: 300, lt: 900 } });
  } else if (query.duration === "15-30") {
    filters.push({ durationSeconds: { gte: 900, lt: 1_800 } });
  } else if (query.duration === "30-plus") {
    filters.push({ durationSeconds: { gte: 1_800 } });
  }

  const start = publicationStart(query.date);
  if (start) {
    filters.push({ publishedAt: { gte: start } });
  }

  return filters.length > 0 ? { AND: filters } : {};
}

function listWhere(
  query: ListQuery,
  extraWhere: Prisma.VideoWhereInput = {},
): Prisma.VideoWhereInput {
  return withPublicVisibility({
    AND: [extraWhere, queryWhere(query)],
  });
}

function regularOrderBy(
  query: ListQuery,
  defaultSort: DefaultSort,
): Prisma.VideoOrderByWithRelationInput[] {
  if (query.sort === "views" || query.sort === "most-viewed") {
    return [{ views: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }];
  }

  if (query.sort === "longest") {
    return [{ durationSeconds: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }];
  }

  if (query.sort === "newest" || defaultSort === "newest") {
    return [{ publishedAt: "desc" }, { createdAt: "desc" }];
  }

  return [
    { hotOverride: "desc" },
    { views: "desc" },
    { publishedAt: "desc" },
    { createdAt: "desc" },
  ];
}

export async function getFilteredVideoPage(
  query: ListQuery,
  path: string,
  options: {
    extraWhere?: Prisma.VideoWhereInput;
    defaultSort?: DefaultSort;
  } = {},
): Promise<ListPage> {
  const page = normalizePage(query.page);
  const where = listWhere(query, options.extraWhere);
  const orderBy = regularOrderBy(query, options.defaultSort ?? "newest");

  const [total, rows] = await Promise.all([
    prisma.video.count({ where }),
    prisma.video.findMany({
      where,
      select: VIDEO_CARD_SELECT,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return makeListPage(rows.map((row) => toVideoCard(row)), total, page, path, query);
}

function normalizeWindow(value: string | undefined, fallback: StatsWindow): StatsWindow {
  if (value === "today" || value === "week" || value === "month" || value === "all") {
    return value;
  }

  return fallback;
}

function statsStart(window: StatsWindow): Date | null {
  if (window === "all") return null;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  if (window === "week") {
    today.setUTCDate(today.getUTCDate() - 6);
  } else if (window === "month") {
    today.setUTCDate(today.getUTCDate() - 29);
  }

  return today;
}

async function getScoredPage(
  query: ListQuery,
  path: string,
  options: {
    defaultWindow: StatsWindow;
    pinHotOverrides?: boolean;
    markHot?: boolean;
  },
): Promise<ListPage> {
  const page = normalizePage(query.page);
  const where = listWhere(query);
  const window = normalizeWindow(query.window, options.defaultWindow);
  const start = statsStart(window);

  const candidates = await prisma.video.findMany({
    where,
    select: {
      id: true,
      hotOverride: true,
    },
  });

  if (candidates.length === 0) {
    return makeListPage([], 0, page, path, query);
  }

  const candidateIds = candidates.map((video) => video.id);
  const stats = await prisma.videoDailyStat.groupBy({
    by: ["videoId"],
    where: {
      videoId: { in: candidateIds },
      ...(start ? { date: { gte: start } } : {}),
    },
    _sum: {
      views: true,
    },
  });

  const scores = new Map(stats.map((row) => [row.videoId, row._sum.views ?? 0]));
  const ranked = [...candidates].sort((a, b) => {
    if (options.pinHotOverrides && a.hotOverride !== b.hotOverride) {
      return Number(b.hotOverride) - Number(a.hotOverride);
    }

    const byScore = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
    if (byScore !== 0) return byScore;

    return a.id.localeCompare(b.id);
  });

  const pageIds = ranked
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    .map((video) => video.id);

  const rows = await prisma.video.findMany({
    where: { id: { in: pageIds } },
    select: VIDEO_CARD_SELECT,
  });
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const items: VideoCard[] = [];

  for (const id of pageIds) {
    const row = rowsById.get(id);
    if (!row) continue;

    items.push(
      toVideoCard(row, {
        views: scores.get(id) ?? 0,
        hot: options.markHot ? true : undefined,
      }),
    );
  }

  return makeListPage(items, ranked.length, page, path, query);
}

export async function getHotPrisma(query: ListQuery = {}): Promise<ListPage> {
  return getScoredPage(query, "/hot", {
    defaultWindow: "today",
    pinHotOverrides: true,
    markHot: true,
  });
}

export async function getMostViewedPrisma(query: ListQuery = {}): Promise<ListPage> {
  if (query.sort === "newest" || query.sort === "longest") {
    return getFilteredVideoPage(query, "/most-viewed");
  }

  return getScoredPage(query, "/most-viewed", {
    defaultWindow: "all",
  });
}

export async function getLatestPrisma(query: ListQuery = {}): Promise<ListPage> {
  return getFilteredVideoPage(query, "/latest");
}
