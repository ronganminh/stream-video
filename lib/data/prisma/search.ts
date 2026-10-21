import { Prisma } from "@prisma/client";

import { prisma } from "../../db";
import { escapeRegex, foldSql, foldText } from "../../search/fold";
import type {
  Category,
  ListQuery,
  SearchResult,
  Tag,
  VideoCard,
} from "../../types";
import { getCategoriesPrisma, getPopularTagsPrisma } from "./categories";
import { normalizePage, PAGE_SIZE } from "./lists";
import {
  VIDEO_CARD_SELECT,
  toVideoCard,
  withPublicVisibility,
} from "./visibility";

type RankedRow = {
  id: string;
  total: bigint;
};

function buildHref(
  searchQuery: string,
  query: ListQuery,
  targetPage: number,
): string {
  const params = new URLSearchParams({ q: searchQuery });

  for (const [key, value] of Object.entries(query)) {
    if (key === "page" || value === undefined || value === "") continue;
    params.set(key, String(value));
  }

  params.set("page", String(targetPage));
  return `/search?${params.toString()}`;
}

function dateStart(value?: string): Date | null {
  const now = Date.now();
  if (value === "today") return new Date(now - 24 * 60 * 60 * 1_000);
  if (value === "week") return new Date(now - 7 * 24 * 60 * 60 * 1_000);
  if (value === "month") return new Date(now - 30 * 24 * 60 * 60 * 1_000);
  return null;
}

function durationSql(value?: string): Prisma.Sql {
  if (value === "under-5") return Prisma.sql`AND s."durationSeconds" < 300`;
  if (value === "5-15") {
    return Prisma.sql`AND s."durationSeconds" >= 300 AND s."durationSeconds" < 900`;
  }
  if (value === "15-30") {
    return Prisma.sql`AND s."durationSeconds" >= 900 AND s."durationSeconds" < 1800`;
  }
  if (value === "30-plus") return Prisma.sql`AND s."durationSeconds" >= 1800`;
  return Prisma.empty;
}

function searchOrderSql(query: ListQuery): Prisma.Sql {
  if (query.sort === "views" || query.sort === "most-viewed") {
    return Prisma.sql`ORDER BY s.views DESC, s."publishedAt" DESC NULLS LAST, score DESC`;
  }
  if (query.sort === "longest") {
    return Prisma.sql`ORDER BY s."durationSeconds" DESC NULLS LAST, score DESC, s."publishedAt" DESC NULLS LAST`;
  }
  if (query.sort === "newest") {
    return Prisma.sql`ORDER BY s."publishedAt" DESC NULLS LAST, score DESC`;
  }
  return Prisma.sql`ORDER BY score DESC, s.views DESC, s."publishedAt" DESC NULLS LAST`;
}

async function rankedSearchIds(
  searchQuery: string,
  query: ListQuery,
): Promise<{ ids: string[]; total: number }> {
  const page = normalizePage(query.page);
  // Accent-insensitive: the query and the searched text are both folded
  // ("tran" matches "Trần", "duc" matches "Đức").
  const needle = foldText(searchQuery.trim());
  const categoryFilter = query.category
    ? Prisma.sql`AND s."categorySlug" = ${query.category}`
    : Prisma.empty;
  const start = dateStart(query.date);
  const dateFilter = start
    ? Prisma.sql`AND s."publishedAt" >= ${start}`
    : Prisma.empty;
  const textFilter = needle
    ? Prisma.sql`AND (
        to_tsvector('simple', s.haystack) @@ plainto_tsquery('simple', ${needle})
        OR similarity(s.haystack, ${needle}) >= 0.12
        OR similarity(s.title, ${needle}) >= 0.18
        OR s.haystack LIKE '%' || ${needle} || '%'
      )`
    : Prisma.empty;
  // Title matches outrank category/tag matches: "tran" should list
  // "Trần Đức" before a video that only has the tag "Transgender".
  const wordInTitle = `(^|[^a-z0-9])${escapeRegex(needle)}([^a-z0-9]|$)`;
  const scoreSql = needle
    ? Prisma.sql`(
        CASE
          WHEN s.title ~ ${wordInTitle} THEN 2
          WHEN s.title LIKE '%' || ${needle} || '%' THEN 1
          ELSE 0
        END
        + ts_rank_cd(to_tsvector('simple', s.haystack), plainto_tsquery('simple', ${needle}))
        + greatest(
            similarity(s.title, ${needle}),
            similarity(s.haystack, ${needle})
          )
      )`
    : Prisma.sql`0::double precision`;
  const orderSql = searchOrderSql(query);

  const rows = await prisma.$queryRaw<RankedRow[]>(Prisma.sql`
    WITH searchable AS (
      SELECT
        v.id,
        ${foldSql(Prisma.sql`v.title`)} AS title,
        v.views,
        v."durationSeconds",
        v."publishedAt",
        c.slug AS "categorySlug",
        ${foldSql(Prisma.sql`concat_ws(
          ' ',
          v.title,
          c.name,
          c.slug,
          coalesce(string_agg(DISTINCT t.name, ' '), ''),
          coalesce(string_agg(DISTINCT t.slug, ' '), '')
        )`)} AS haystack
      FROM "Video" v
      LEFT JOIN "Category" c ON c.id = v."categoryId"
      LEFT JOIN "VideoTag" vt ON vt."videoId" = v.id
      LEFT JOIN "Tag" t ON t.id = vt."tagId"
      WHERE
        v."isPublished" = true
        AND v."isHidden" = false
        AND v.status = 'AVAILABLE'::"Availability"
        AND EXISTS (
          SELECT 1
          FROM "Mirror" m
          WHERE m."videoId" = v.id
            AND m.status = 'OK'::"MirrorStatus"
        )
      GROUP BY v.id, c.id
    )
    SELECT
      s.id,
      count(*) OVER() AS total,
      ${scoreSql} AS score
    FROM searchable s
    WHERE true
      ${textFilter}
      ${categoryFilter}
      ${durationSql(query.duration)}
      ${dateFilter}
    ${orderSql}
    OFFSET ${(page - 1) * PAGE_SIZE}
    LIMIT ${PAGE_SIZE}
  `);

  return {
    ids: rows.map((row) => row.id),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
  };
}

async function cardsForIds(ids: string[]): Promise<VideoCard[]> {
  if (ids.length === 0) return [];

  const rows = await prisma.video.findMany({
    where: withPublicVisibility({ id: { in: ids } }),
    select: VIDEO_CARD_SELECT,
  });
  const byId = new Map(rows.map((row) => [row.id, toVideoCard(row)]));

  return ids.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}

async function relatedCategoriesForQuery(needle: string): Promise<Category[]> {
  const categories = await getCategoriesPrisma();
  if (!needle) return categories.slice(0, 6);

  const folded = foldText(needle);
  return categories
    .filter(
      (category) =>
        foldText(category.name).includes(folded) ||
        foldText(category.slug).includes(folded),
    )
    .slice(0, 6);
}

async function relatedTagsForQuery(needle: string): Promise<Tag[]> {
  const popular = await getPopularTagsPrisma(40);
  if (!needle) return popular.slice(0, 8);

  const folded = foldText(needle);
  return popular
    .filter(
      (tag) =>
        foldText(tag.name).includes(folded) ||
        foldText(tag.slug).includes(folded),
    )
    .slice(0, 8);
}

export async function searchPrisma(
  searchQuery: string,
  query: ListQuery = {},
): Promise<SearchResult> {
  const page = normalizePage(query.page);
  const needle = searchQuery.trim();
  const [{ ids, total }, relatedCategories, relatedTags] = await Promise.all([
    rankedSearchIds(searchQuery, query),
    relatedCategoriesForQuery(needle),
    relatedTagsForQuery(needle),
  ]);
  const results = await cardsForIds(ids);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    results,
    page,
    pageSize: PAGE_SIZE,
    total,
    nextHref:
      page < totalPages ? buildHref(searchQuery, query, page + 1) : undefined,
    prevHref: page > 1 ? buildHref(searchQuery, query, page - 1) : undefined,
    relatedCategories,
    relatedTags,
  };
}

export async function getSuggestionsPrisma(searchQuery: string) {
  const needle = searchQuery.trim();

  const [popularTags, categories, videos] = await Promise.all([
    getPopularTagsPrisma(20),
    getCategoriesPrisma(),
    needle
      ? // Same accent-insensitive ranking as the search page.
        rankedSearchIds(needle, { page: 1 }).then(({ ids }) => cardsForIds(ids.slice(0, 5)))
      : prisma.video
          .findMany({
            where: withPublicVisibility(),
            select: VIDEO_CARD_SELECT,
            orderBy: [{ views: "desc" }, { publishedAt: "desc" }],
            take: 5,
          })
          .then((rows) => rows.map((row) => toVideoCard(row))),
  ]);

  const folded = foldText(needle);
  const matches = (value: string) => !folded || foldText(value).includes(folded);
  const tags = popularTags.filter((tag) => matches(tag.name) || matches(tag.slug));
  const matchingCategories = categories.filter(
    (category) => matches(category.name) || matches(category.slug),
  );

  return {
    trending: popularTags
      .map((tag) => tag.name.toLowerCase())
      .filter(matches)
      .slice(0, 5),
    tags: tags.slice(0, 6),
    categories: matchingCategories.slice(0, 5),
    videos,
  };
}
