import { describe, expect, it } from "vitest";

import {
  SITE_NAME,
  buildWatchMetadata,
  defaultMetadata,
  listShareMetadata,
  pageSuffix,
  watchDescription,
} from "./metadata";

const video = {
  title: "Morning Gym Session",
  description: "",
  thumbnailUrl: "/media/abc.webp?v=0123456789ab",
  durationSeconds: 1_260,
  tags: [
    { slug: "gay-video", name: "Gay video" },
    { slug: "vietnam-video", name: "Vietnam video" },
  ],
  category: { slug: "gym", name: "Gym" },
  publishedAt: "2026-10-01T12:00:00.000Z",
  availability: "AVAILABLE" as const,
};

describe("watch page metadata", () => {
  it("emits absolute share URLs and a large X card for videos with a thumbnail", () => {
    const metadata = buildWatchMetadata("morning-gym-session", video);

    expect(metadata.title).toBe(`Morning Gym Session | ${SITE_NAME}`);
    expect(metadata.alternates?.canonical).toBe(
      "https://gayvideo.fun/watch/morning-gym-session",
    );
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph).toMatchObject({
      type: "video.other",
      siteName: SITE_NAME,
      title: "Morning Gym Session",
      url: "https://gayvideo.fun/watch/morning-gym-session",
      duration: 1_260,
      tags: ["Gay video", "Vietnam video"],
      images: [
        {
          url: "https://gayvideo.fun/media/abc.webp?v=0123456789ab",
          width: 640,
          height: 360,
          alt: "Morning Gym Session",
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Morning Gym Session",
      images: [{ url: "https://gayvideo.fun/media/abc.webp?v=0123456789ab" }],
    });
  });

  it("falls back to the site icon and a small card without a thumbnail", () => {
    const metadata = buildWatchMetadata("no-thumb", { ...video, thumbnailUrl: null });

    expect(metadata.twitter).toMatchObject({ card: "summary" });
    expect(metadata.openGraph).toMatchObject({
      images: [{ url: "https://gayvideo.fun/icon2.png", width: 192, height: 192 }],
    });
  });

  it("noindexes unavailable videos but keeps share metadata", () => {
    const metadata = buildWatchMetadata("gone", { ...video, availability: "REMOVED" });

    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.openGraph).toMatchObject({ title: "Morning Gym Session" });
  });

  it("encodes the slug in canonical and og:url", () => {
    const metadata = buildWatchMetadata("cà phê", video);

    expect(metadata.alternates?.canonical).toBe(
      "https://gayvideo.fun/watch/c%C3%A0%20ph%C3%AA",
    );
  });
});

describe("watch description", () => {
  it("builds a summary from duration, category and tags when there is no description", () => {
    expect(watchDescription(video)).toBe(
      `Watch Morning Gym Session free on ${SITE_NAME} · 21 min · Gym · Gay video, Vietnam video.`,
    );
  });

  it("skips the placeholder category and missing duration", () => {
    expect(
      watchDescription({
        ...video,
        durationSeconds: null,
        category: { slug: "uncategorized", name: "Uncategorized" },
        tags: [],
      }),
    ).toBe(`Watch Morning Gym Session free on ${SITE_NAME}.`);
  });

  it("uses the admin description, collapsed and truncated on a word boundary", () => {
    const description = watchDescription({
      ...video,
      description: `  Line one\n\n${"word ".repeat(80)}`,
    });

    expect(description.startsWith("Line one word word")).toBe(true);
    expect(description.length).toBeLessThanOrEqual(200);
    expect(description.endsWith("word…")).toBe(true);
  });
});

describe("default metadata", () => {
  it("sets metadataBase and site-wide share defaults", () => {
    const metadata = defaultMetadata();

    expect(metadata.metadataBase?.toString()).toBe("https://gayvideo.fun/");
    expect(metadata.description).toBeTruthy();
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      siteName: SITE_NAME,
      url: "https://gayvideo.fun/",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary" });
  });
});

describe("list share metadata", () => {
  it("builds absolute share URLs with a large card when there is an image", () => {
    const metadata = listShareMetadata({
      title: "#Gym Videos – Page 2",
      description: "12 free gay videos tagged #Gym (page 2).",
      canonical: "/tag/gym?page=2",
      image: "/media/v1.webp?v=0123456789ab",
    });

    expect(metadata.description).toBe("12 free gay videos tagged #Gym (page 2).");
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      siteName: SITE_NAME,
      title: "#Gym Videos – Page 2",
      url: "https://gayvideo.fun/tag/gym?page=2",
      images: [{ url: "https://gayvideo.fun/media/v1.webp?v=0123456789ab", width: 640, height: 360 }],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: ["https://gayvideo.fun/media/v1.webp?v=0123456789ab"],
    });
  });

  it("falls back to the site icon and a small card", () => {
    const metadata = listShareMetadata({ title: "Hot Videos", description: "d", canonical: "/hot" });

    expect(metadata.twitter).toMatchObject({ card: "summary" });
    expect(metadata.openGraph).toMatchObject({ images: [{ url: "https://gayvideo.fun/icon2.png" }] });
  });

  it("suffixes titles after the first page only", () => {
    expect(pageSuffix(1)).toBe("");
    expect(pageSuffix(3)).toBe(" – Page 3");
  });
});
