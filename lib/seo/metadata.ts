import type { Metadata } from "next";

import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from "../thumbnailSize";
import type { VideoPage } from "../types";
import { absoluteUrl } from "./site";

export const SITE_NAME = "GayVideo.fun";

export const DEFAULT_DESCRIPTION =
  "Watch free gay videos on GayVideo.fun: the latest uploads, trending clips, categories and tags, streamed from multiple mirrors.";

// Fallback share image for pages without their own artwork.
const DEFAULT_IMAGE = {
  url: absoluteUrl("/icon2.png"),
  width: 192,
  height: 192,
  alt: SITE_NAME,
};

const DESCRIPTION_LIMIT = 200;

function truncate(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function formatMinutes(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

export function watchDescription(
  video: Pick<VideoPage, "title" | "description" | "durationSeconds" | "tags" | "category">,
): string {
  if (video.description?.trim()) {
    return truncate(video.description, DESCRIPTION_LIMIT);
  }

  const tagNames = video.tags.map((tag) => tag.name).slice(0, 4);
  const facts = [
    formatMinutes(video.durationSeconds),
    video.category?.slug !== "uncategorized" ? video.category?.name : null,
    tagNames.length ? tagNames.join(", ") : null,
  ].filter(Boolean);

  return truncate(
    `Watch ${video.title} free on ${SITE_NAME}${facts.length ? ` · ${facts.join(" · ")}` : ""}.`,
    DESCRIPTION_LIMIT,
  );
}

export function defaultMetadata(): Metadata {
  return {
    metadataBase: new URL(absoluteUrl("/")),
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
      url: absoluteUrl("/"),
      images: [DEFAULT_IMAGE],
    },
    twitter: {
      card: "summary",
      title: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
      images: [DEFAULT_IMAGE.url],
    },
  };
}

export function buildWatchMetadata(
  slug: string,
  video: Pick<
    VideoPage,
    | "title"
    | "description"
    | "thumbnailUrl"
    | "durationSeconds"
    | "tags"
    | "category"
    | "publishedAt"
    | "availability"
  >,
): Metadata {
  const path = `/watch/${encodeURIComponent(slug)}`;
  const url = absoluteUrl(path);
  const title = `${video.title} | ${SITE_NAME}`;
  const description = watchDescription(video);
  const noindex = (video.availability ?? "AVAILABLE") !== "AVAILABLE";
  const image = video.thumbnailUrl
    ? {
        url: absoluteUrl(video.thumbnailUrl),
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
        alt: video.title,
      }
    : DEFAULT_IMAGE;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      // A page's openGraph replaces the layout's, so repeat the site fields.
      type: "video.other",
      siteName: SITE_NAME,
      title: video.title,
      description,
      url,
      images: [image],
      ...(video.durationSeconds ? { duration: video.durationSeconds } : {}),
      ...(video.publishedAt ? { releaseDate: video.publishedAt } : {}),
      ...(video.tags.length ? { tags: video.tags.map((tag) => tag.name) } : {}),
    },
    twitter: {
      card: video.thumbnailUrl ? "summary_large_image" : "summary",
      title: video.title,
      description,
      images: [{ url: image.url, alt: video.title }],
    },
  };
}
