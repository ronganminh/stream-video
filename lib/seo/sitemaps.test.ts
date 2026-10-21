import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  video: {
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  },
  category: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

import {
  VIDEO_SITEMAP_PAGE_SIZE,
  categorySitemapEntries,
  sitemapIndexXml,
  sitemapXml,
  staticSitemapEntries,
  tagSitemapEntries,
  videoSitemapEntries,
  videoSitemapIndexEntries,
  videoSitemapPageCount,
} from "./sitemaps";

beforeEach(() => vi.resetAllMocks());

const day = (n: number) => new Date(Date.UTC(2026, 9, n));

function videoRow(overrides: Record<string, unknown> = {}) {
  return {
    slug: "beach-day",
    title: "Beach <Day> & Night",
    description: null,
    thumbnailPath: "/media/v1.webp?v=0123456789ab",
    durationSeconds: 1265,
    publishedAt: day(2),
    createdAt: day(1),
    updatedAt: day(3),
    category: { slug: "beach", name: "Beach" },
    videoTags: [{ tag: { slug: "gay-video", name: "Gay video" } }],
    mirrors: [{ embedUrl: "https://playmogo.com/e/abc" }],
    ...overrides,
  };
}

describe("video sitemap", () => {
  it("emits Google video entries with escaped, absolute fields", async () => {
    db.video.findMany.mockResolvedValue([videoRow()]);

    const xml = sitemapXml(await videoSitemapEntries(1));

    expect(xml).toContain('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"');
    expect(xml).toContain("<loc>https://gayvideo.fun/watch/beach-day</loc>");
    // Publication time, not updatedAt (which moves on every view).
    expect(xml).toContain("<lastmod>2026-10-02T00:00:00.000Z</lastmod>");
    expect(xml).toContain(
      "<video:thumbnail_loc>https://gayvideo.fun/media/v1.webp?v=0123456789ab</video:thumbnail_loc>",
    );
    expect(xml).toContain("<video:title>Beach &lt;Day&gt; &amp; Night</video:title>");
    expect(xml).toMatch(/<video:description>Watch Beach &lt;Day&gt; &amp; Night free on GayVideo\.fun · 21 min · Beach · Gay video\.<\/video:description>/);
    expect(xml).toContain("<video:player_loc>https://playmogo.com/e/abc</video:player_loc>");
    expect(xml).toContain("<video:duration>1265</video:duration>");
    expect(xml).toContain("<video:publication_date>2026-10-02T00:00:00.000Z</video:publication_date>");
    expect(xml).toContain("<video:family_friendly>no</video:family_friendly>");
    expect(xml).toContain("<video:tag>Gay video</video:tag>");
  });

  it("pages with a stable oldest-first order", async () => {
    db.video.findMany.mockResolvedValue([]);
    await videoSitemapEntries(3);

    expect(db.video.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: 2 * VIDEO_SITEMAP_PAGE_SIZE,
        take: VIDEO_SITEMAP_PAGE_SIZE,
      }),
    );
  });

  it("lists the page without video details when Google's required fields are missing", async () => {
    db.video.findMany.mockResolvedValue([
      videoRow({ slug: "no-thumb", thumbnailPath: null }),
      videoRow({ slug: "no-player", mirrors: [] }),
      videoRow({ slug: "bad-player", mirrors: [{ embedUrl: "javascript:alert(1)" }] }),
    ]);

    const entries = await videoSitemapEntries(1);

    expect(entries.map((entry) => [entry.loc.split("/").pop(), Boolean(entry.video)])).toEqual([
      ["no-thumb", false],
      ["no-player", false],
      ["bad-player", false],
    ]);
    expect(sitemapXml(entries)).not.toContain("xmlns:video");
  });

  it("caps duration and tag count at Google's limits", async () => {
    db.video.findMany.mockResolvedValue([
      videoRow({
        durationSeconds: 40_000,
        videoTags: Array.from({ length: 40 }, (_, i) => ({ tag: { slug: `t${i}`, name: `t${i}` } })),
      }),
    ]);

    const xml = sitemapXml(await videoSitemapEntries(1));

    expect(xml).toContain("<video:duration>28800</video:duration>");
    expect(xml.match(/<video:tag>/g)).toHaveLength(32);
  });

  it("counts pages and dates each file by its newest change", async () => {
    db.video.count.mockResolvedValue(VIDEO_SITEMAP_PAGE_SIZE + 1);
    expect(await videoSitemapPageCount()).toBe(2);
    db.video.count.mockResolvedValue(0);
    expect(await videoSitemapPageCount()).toBe(1);

    db.video.findMany.mockResolvedValue([
      ...Array.from({ length: VIDEO_SITEMAP_PAGE_SIZE }, () => ({
        publishedAt: day(1),
        createdAt: day(1),
      })),
      { publishedAt: null, createdAt: day(9) },
    ]);
    expect(await videoSitemapIndexEntries()).toEqual([
      { path: "/sitemaps/videos/1.xml", lastmod: "2026-10-01T00:00:00.000Z" },
      { path: "/sitemaps/videos/2.xml", lastmod: "2026-10-09T00:00:00.000Z" },
    ]);
  });
});

describe("taxonomy and static sitemaps", () => {
  it("dates categories by their newest public video and leaves empty ones out", async () => {
    db.category.findMany.mockResolvedValue([
      { id: "c1", slug: "beach" },
      { id: "c2", slug: "empty" },
    ]);
    db.video.groupBy.mockResolvedValue([{ categoryId: "c1", _max: { publishedAt: day(5) } }]);

    expect(await categorySitemapEntries()).toEqual([
      { loc: "https://gayvideo.fun/category/beach", lastmod: "2026-10-05T00:00:00.000Z" },
    ]);
  });

  it("lists only tags with five or more public videos, dated by the newest", async () => {
    const tagged = (slug: string, n: number) => ({
      publishedAt: day(n),
      videoTags: [{ tag: { slug, name: slug } }],
    });
    db.video.findMany.mockResolvedValue([
      ...[1, 2, 3, 4, 7].map((n) => tagged("busy", n)),
      ...[1, 2].map((n) => tagged("thin", n)),
    ]);

    expect(await tagSitemapEntries()).toEqual([
      { loc: "https://gayvideo.fun/tag/busy", lastmod: "2026-10-07T00:00:00.000Z" },
    ]);
  });

  it("dates list pages by the newest publication and leaves legal pages undated", async () => {
    db.video.aggregate.mockResolvedValue({ _max: { publishedAt: day(8) } });

    const entries = await staticSitemapEntries();

    expect(entries.find((entry) => entry.loc === "https://gayvideo.fun/latest")?.lastmod).toBe(
      "2026-10-08T00:00:00.000Z",
    );
    expect(entries.find((entry) => entry.loc === "https://gayvideo.fun/terms")?.lastmod).toBeUndefined();
  });

  it("writes a sitemap index with absolute locations and lastmod", () => {
    expect(
      sitemapIndexXml([
        { path: "/sitemaps/videos/1.xml", lastmod: "2026-10-01T00:00:00.000Z" },
        { path: "/sitemaps/tags.xml" },
      ]),
    ).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        "<sitemap><loc>https://gayvideo.fun/sitemaps/videos/1.xml</loc><lastmod>2026-10-01T00:00:00.000Z</lastmod></sitemap>" +
        "<sitemap><loc>https://gayvideo.fun/sitemaps/tags.xml</loc></sitemap></sitemapindex>",
    );
  });
});
