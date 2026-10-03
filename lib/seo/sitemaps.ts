import { db } from "@/lib/db";

import { absoluteUrl } from "./site";

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
};

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

export async function videoSitemapEntries(): Promise<SitemapEntry[]> {
  const rows = await db.video.findMany({
    where: PUBLIC_VIDEO_WHERE,
    select: {
      slug: true,
      updatedAt: true,
      publishedAt: true,
      createdAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((video) => ({
    loc: absoluteUrl("/watch/" + video.slug),
    lastmod: (video.updatedAt ?? video.publishedAt ?? video.createdAt).toISOString(),
  }));
}

export async function categorySitemapEntries(): Promise<SitemapEntry[]> {
  const rows = await db.category.findMany({
    select: { slug: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return rows.map((category) => ({
    loc: absoluteUrl("/category/" + category.slug),
  }));
}

export async function tagSitemapEntries(): Promise<SitemapEntry[]> {
  const visibleVideos = await db.video.findMany({
    where: PUBLIC_VIDEO_WHERE,
    select: { id: true },
  });

  if (!visibleVideos.length) return [];

  const grouped = await db.videoTag.groupBy({
    by: ["tagId"],
    where: {
      videoId: {
        in: visibleVideos.map((video) => video.id),
      },
    },
    _count: {
      _all: true,
    },
  });

  const indexableTagIds = grouped
    .filter((row) => row._count._all >= 5)
    .map((row) => row.tagId);

  if (!indexableTagIds.length) return [];

  const tags = await db.tag.findMany({
    where: { id: { in: indexableTagIds } },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });

  return tags.map((tag) => ({
    loc: absoluteUrl("/tag/" + tag.slug),
  }));
}

export function staticSitemapEntries(): SitemapEntry[] {
  return [
    "/",
    "/latest",
    "/hot",
    "/most-viewed",
    "/categories",
    "/content-removal",
    "/privacy",
    "/terms",
    "/cookies",
  ].map((path) => ({ loc: absoluteUrl(path) }));
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function sitemapXml(entries: SitemapEntry[]) {
  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod
        ? "<lastmod>" + escapeXml(entry.lastmod) + "</lastmod>"
        : "";
      return (
        "<url><loc>" +
        escapeXml(entry.loc) +
        "</loc>" +
        lastmod +
        "</url>"
      );
    })
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls +
    "</urlset>"
  );
}

export function sitemapIndexXml(paths: string[]) {
  const rows = paths
    .map(
      (path) =>
        "<sitemap><loc>" +
        escapeXml(absoluteUrl(path)) +
        "</loc></sitemap>",
    )
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    rows +
    "</sitemapindex>"
  );
}
