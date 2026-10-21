import { db } from "@/lib/db";

import { watchDescription } from "./metadata";
import { absoluteUrl } from "./site";

export type VideoSitemapInfo = {
  thumbnailLoc: string;
  title: string;
  description: string;
  playerLoc: string;
  durationSeconds: number | null;
  publicationDate: string | null;
  tags: string[];
};

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
  video?: VideoSitemapInfo;
};

export type SitemapIndexEntry = {
  path: string;
  lastmod?: string;
};

// Google allows 50,000 URLs per sitemap, but video entries are heavy; smaller
// files keep each response fast and let crawlers refetch only what changed.
export const VIDEO_SITEMAP_PAGE_SIZE = 1000;

// Google's limits for video sitemap fields.
const MAX_VIDEO_TAGS = 32;
const MAX_VIDEO_DESCRIPTION = 2048;
const MAX_VIDEO_DURATION = 28_800;

const PUBLIC_VIDEO_WHERE = {
  isPublished: true,
  isHidden: false,
  status: "AVAILABLE" as const,
  mirrors: {
    some: {
      status: "OK" as const,
    },
  },
};

// Video.updatedAt moves on every view and like (the counters live on the
// row), so it says nothing about content changes. Publication time is the
// stable signal Google wants for lastmod.

// Oldest first, so a video keeps its sitemap file as new ones are published.
const STABLE_ORDER = [{ createdAt: "asc" as const }, { id: "asc" as const }];

function isoDate(...dates: (Date | null | undefined)[]): string | undefined {
  return dates.find((date): date is Date => date instanceof Date)?.toISOString();
}

function latest(dates: (Date | null | undefined)[]): Date | undefined {
  let max: Date | undefined;
  for (const date of dates) {
    if (date && (!max || date > max)) max = date;
  }
  return max;
}

export async function videoSitemapPageCount(): Promise<number> {
  const count = await db.video.count({ where: PUBLIC_VIDEO_WHERE });
  return Math.max(1, Math.ceil(count / VIDEO_SITEMAP_PAGE_SIZE));
}

export async function videoSitemapIndexEntries(): Promise<SitemapIndexEntry[]> {
  const rows = await db.video.findMany({
    where: PUBLIC_VIDEO_WHERE,
    select: { publishedAt: true, createdAt: true },
    orderBy: STABLE_ORDER,
  });

  const pages = Math.max(1, Math.ceil(rows.length / VIDEO_SITEMAP_PAGE_SIZE));
  return Array.from({ length: pages }, (_, index) => {
    const chunk = rows.slice(
      index * VIDEO_SITEMAP_PAGE_SIZE,
      (index + 1) * VIDEO_SITEMAP_PAGE_SIZE,
    );
    return {
      path: `/sitemaps/videos/${index + 1}.xml`,
      lastmod: latest(chunk.map((row) => row.publishedAt ?? row.createdAt))?.toISOString(),
    };
  });
}

export async function videoSitemapEntries(page: number): Promise<SitemapEntry[]> {
  const rows = await db.video.findMany({
    where: PUBLIC_VIDEO_WHERE,
    orderBy: STABLE_ORDER,
    skip: (page - 1) * VIDEO_SITEMAP_PAGE_SIZE,
    take: VIDEO_SITEMAP_PAGE_SIZE,
    select: {
      slug: true,
      title: true,
      description: true,
      thumbnailPath: true,
      durationSeconds: true,
      publishedAt: true,
      createdAt: true,
      category: { select: { slug: true, name: true } },
      videoTags: {
        select: { tag: { select: { slug: true, name: true } } },
        take: MAX_VIDEO_TAGS,
      },
      mirrors: {
        where: { status: "OK" },
        orderBy: { host: { sortOrder: "asc" } },
        select: { embedUrl: true },
        take: 1,
      },
    },
  });

  return rows.map((video) => {
    const entry: SitemapEntry = {
      loc: absoluteUrl("/watch/" + video.slug),
      lastmod: isoDate(video.publishedAt, video.createdAt),
    };

    const playerLoc = video.mirrors[0]?.embedUrl;
    // Google requires a thumbnail and a player (or file) URL; without them the
    // page is still listed, just without video details.
    if (video.thumbnailPath && playerLoc && /^https?:\/\//i.test(playerLoc)) {
      const tags = video.videoTags.map(({ tag }) => tag);
      entry.video = {
        thumbnailLoc: absoluteUrl(video.thumbnailPath),
        title: video.title,
        description: watchDescription({
          title: video.title,
          description: video.description ?? "",
          durationSeconds: video.durationSeconds,
          tags,
          category: video.category ?? { slug: "uncategorized", name: "Uncategorized" },
        }),
        playerLoc,
        durationSeconds: video.durationSeconds,
        publicationDate: isoDate(video.publishedAt, video.createdAt) ?? null,
        tags: tags.map((tag) => tag.name),
      };
    }

    return entry;
  });
}

export async function categorySitemapEntries(): Promise<SitemapEntry[]> {
  const [rows, newest] = await Promise.all([
    db.category.findMany({
      select: { id: true, slug: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.video.groupBy({
      by: ["categoryId"],
      where: PUBLIC_VIDEO_WHERE,
      _max: { publishedAt: true },
    }),
  ]);
  const lastmodById = new Map(
    newest.map((row) => [row.categoryId, row._max.publishedAt]),
  );

  // Empty categories have no page (404), so they stay out of the sitemap.
  return rows
    .filter((category) => lastmodById.has(category.id))
    .map((category) => ({
      loc: absoluteUrl("/category/" + category.slug),
      lastmod: isoDate(lastmodById.get(category.id)),
    }));
}

export async function tagSitemapEntries(): Promise<SitemapEntry[]> {
  const visibleVideos = await db.video.findMany({
    where: PUBLIC_VIDEO_WHERE,
    select: {
      publishedAt: true,
      videoTags: { select: { tag: { select: { slug: true, name: true } } } },
    },
  });

  const tags = new Map<string, { name: string; count: number; lastmod?: Date }>();
  for (const video of visibleVideos) {
    for (const { tag } of video.videoTags) {
      const current = tags.get(tag.slug) ?? { name: tag.name, count: 0 };
      current.count += 1;
      current.lastmod = latest([current.lastmod, video.publishedAt]);
      tags.set(tag.slug, current);
    }
  }

  // Tag pages with fewer than five videos are noindex, so leave them out.
  return [...tags.entries()]
    .filter(([, tag]) => tag.count >= 5)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([slug, tag]) => ({
      loc: absoluteUrl("/tag/" + slug),
      lastmod: isoDate(tag.lastmod),
    }));
}

export async function staticSitemapEntries(): Promise<SitemapEntry[]> {
  const newest = await db.video.aggregate({
    where: PUBLIC_VIDEO_WHERE,
    _max: { publishedAt: true },
  });
  const listsChanged = isoDate(newest._max.publishedAt);

  return [
    ...["/", "/latest", "/hot", "/most-viewed", "/categories"].map((path) => ({
      loc: absoluteUrl(path),
      lastmod: listsChanged,
    })),
    ...["/content-removal", "/privacy", "/terms", "/cookies"].map((path) => ({
      loc: absoluteUrl(path),
    })),
  ];
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function element(name: string, value: string | number | undefined | null) {
  return value === undefined || value === null || value === ""
    ? ""
    : `<${name}>${escapeXml(String(value))}</${name}>`;
}

function videoXml(video: VideoSitemapInfo) {
  const duration =
    video.durationSeconds && video.durationSeconds > 0
      ? Math.min(MAX_VIDEO_DURATION, Math.round(video.durationSeconds))
      : undefined;

  return (
    "<video:video>" +
    element("video:thumbnail_loc", video.thumbnailLoc) +
    element("video:title", video.title) +
    element("video:description", video.description.slice(0, MAX_VIDEO_DESCRIPTION)) +
    element("video:player_loc", video.playerLoc) +
    element("video:duration", duration) +
    element("video:publication_date", video.publicationDate) +
    element("video:family_friendly", "no") +
    video.tags
      .slice(0, MAX_VIDEO_TAGS)
      .map((tag) => element("video:tag", tag))
      .join("") +
    "</video:video>"
  );
}

export function sitemapXml(entries: SitemapEntry[]) {
  const hasVideo = entries.some((entry) => entry.video);
  const urls = entries
    .map(
      (entry) =>
        "<url>" +
        element("loc", entry.loc) +
        element("lastmod", entry.lastmod) +
        (entry.video ? videoXml(entry.video) : "") +
        "</url>",
    )
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' +
    (hasVideo ? ' xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"' : "") +
    ">" +
    urls +
    "</urlset>"
  );
}

export function sitemapIndexXml(entries: SitemapIndexEntry[]) {
  const rows = entries
    .map(
      (entry) =>
        "<sitemap>" +
        element("loc", absoluteUrl(entry.path)) +
        element("lastmod", entry.lastmod) +
        "</sitemap>",
    )
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    rows +
    "</sitemapindex>"
  );
}

export function xmlResponse(xml: string, status = 200) {
  return new Response(xml, {
    status,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
