import type { MirrorPublic, VideoPage } from "../types";
import { SITE_NAME, watchDescription } from "./metadata";
import { absoluteUrl } from "./site";

// Serialize for a <script type="application/ld+json"> body. "<" is escaped so
// a title or tag containing "</script>" cannot end the tag early.
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** ISO 8601 duration, e.g. 1265 -> "PT21M5S". Undefined when unknown. */
export function isoDuration(seconds: number | null | undefined): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${secs ? `${secs}S` : ""}`;
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

const FALLBACK_THUMBNAIL = absoluteUrl("/icon2.png");

// Only real players: Google rejects embed URLs that are not http(s).
function playerUrl(mirrors: Pick<MirrorPublic, "embedUrl">[]): string | undefined {
  return mirrors
    .map((mirror) => mirror.embedUrl)
    .find((url) => /^https?:\/\//i.test(url ?? ""));
}

export function videoObjectJsonLd(
  slug: string,
  video: Pick<
    VideoPage,
    | "title"
    | "description"
    | "thumbnailUrl"
    | "durationSeconds"
    | "publishedAt"
    | "views"
    | "tags"
    | "category"
  >,
  mirrors: Pick<MirrorPublic, "embedUrl">[],
) {
  const url = absoluteUrl(`/watch/${encodeURIComponent(slug)}`);

  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `${url}#video`,
    url,
    name: video.title,
    description: watchDescription(video),
    // Required by Google; fall back to the site icon rather than omitting it.
    thumbnailUrl: [video.thumbnailUrl ? absoluteUrl(video.thumbnailUrl) : FALLBACK_THUMBNAIL],
    uploadDate: video.publishedAt,
    duration: isoDuration(video.durationSeconds),
    // Videos are streamed from third-party hosts, so there is no direct file
    // URL to offer as contentUrl; the host player is the embedUrl.
    embedUrl: playerUrl(mirrors),
    isFamilyFriendly: false,
    ...(video.category.slug !== "uncategorized" ? { genre: video.category.name } : {}),
    ...(video.tags.length ? { keywords: video.tags.map((tag) => tag.name).join(", ") } : {}),
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: { "@type": "WatchAction" },
      userInteractionCount: video.views,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: absoluteUrl("/"),
      logo: { "@type": "ImageObject", url: FALLBACK_THUMBNAIL },
    },
  };
}
