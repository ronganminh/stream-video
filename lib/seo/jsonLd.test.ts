import { describe, expect, it } from "vitest";

import { breadcrumbJsonLd, isoDuration, jsonLdHtml, videoObjectJsonLd } from "./jsonLd";

const video = {
  title: "Beach Day",
  description: "",
  thumbnailUrl: "/media/v1.webp?v=0123456789ab",
  durationSeconds: 3725,
  publishedAt: "2026-10-02T00:00:00.000Z",
  views: 42,
  tags: [
    { slug: "gay-video", name: "Gay video" },
    { slug: "beach", name: "Beach" },
  ],
  category: { slug: "beach", name: "Beach" },
};

describe("isoDuration", () => {
  it.each([
    [3725, "PT1H2M5S"],
    [1260, "PT21M"],
    [59, "PT59S"],
    [3600, "PT1H"],
    [0, undefined],
    [null, undefined],
  ])("%s -> %s", (seconds, expected) => {
    expect(isoDuration(seconds)).toBe(expected);
  });
});

describe("videoObjectJsonLd", () => {
  it("has every field Google's video rich results use", () => {
    const data = videoObjectJsonLd("beach-day", video, [
      { embedUrl: "javascript:void(0)" },
      { embedUrl: "https://playmogo.com/e/abc" },
    ]);

    expect(data).toMatchObject({
      "@type": "VideoObject",
      url: "https://gayvideo.fun/watch/beach-day",
      name: "Beach Day",
      description: expect.stringContaining("Beach Day"),
      thumbnailUrl: ["https://gayvideo.fun/media/v1.webp?v=0123456789ab"],
      uploadDate: "2026-10-02T00:00:00.000Z",
      duration: "PT1H2M5S",
      embedUrl: "https://playmogo.com/e/abc",
      isFamilyFriendly: false,
      genre: "Beach",
      keywords: "Gay video, Beach",
      interactionStatistic: { userInteractionCount: 42 },
    });
    // No direct file URL exists (videos stream from host players).
    expect(data).not.toHaveProperty("contentUrl");
  });

  it("falls back to the site icon and omits invalid players", () => {
    const data = videoObjectJsonLd(
      "x",
      { ...video, thumbnailUrl: null, tags: [], category: { slug: "uncategorized", name: "Uncategorized" } },
      [],
    );

    expect(data.thumbnailUrl).toEqual(["https://gayvideo.fun/icon2.png"]);
    expect(data.embedUrl).toBeUndefined();
    expect(data).not.toHaveProperty("genre");
    expect(data).not.toHaveProperty("keywords");
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers items and makes URLs absolute", () => {
    expect(
      breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Beach", path: "/category/beach" },
      ]).itemListElement,
    ).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://gayvideo.fun/" },
      { "@type": "ListItem", position: 2, name: "Beach", item: "https://gayvideo.fun/category/beach" },
    ]);
  });
});

describe("jsonLdHtml", () => {
  it("cannot be used to close the script tag", () => {
    const html = jsonLdHtml({ name: "</script><script>alert(1)</script>" });

    expect(html).not.toContain("</script>");
    expect(JSON.parse(html)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
