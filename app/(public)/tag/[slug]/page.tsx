import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdSlot } from "@/components/ads/AdSlot";
import { VideoCard } from "@/components/cards/VideoCard";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadMore } from "@/components/filters/LoadMore";
import { Pagination } from "@/components/filters/Pagination";
import { TagChip } from "@/components/primitives";
import { getTag } from "@/lib/data";
import { getAdHtml } from "@/lib/data/prisma/ads";

import styles from "./page.module.css";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === "string" && value ? value : undefined;
}

function positivePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function queryFrom(
  params: Record<string, string | string[] | undefined>,
) {
  return {
    sort: one(params, "sort"),
    duration: one(params, "duration"),
    date: one(params, "date"),
    page: positivePage(one(params, "page")),
  };
}

function hasFilters(query: ReturnType<typeof queryFrom>) {
  return Boolean(query.sort || query.duration || query.date);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const query = queryFrom(raw);
  const result = await getTag(slug, { page: 1 });
  if (!result) return {};

  const basePath = `/tag/${slug}`;
  const filtered = hasFilters(query);
  const thin = result.tag.count < 5;
  const suffix = query.page > 1 ? ` – Page ${query.page}` : "";
  const canonical = filtered
    ? basePath
    : query.page > 1
      ? `${basePath}?page=${query.page}`
      : basePath;

  return {
    title: `#${result.tag.name} Videos${suffix} | GayVideo.fun`,
    alternates: { canonical },
    robots:
      thin || filtered
        ? { index: false, follow: true }
        : { index: true, follow: true },
  };
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const query = queryFrom(raw);
  const [result, adHtml] = await Promise.all([
    getTag(slug, query),
    getAdHtml("list-in-feed"),
  ]);
  if (!result) notFound();

  const totalPages = Math.max(
    1,
    Math.ceil(result.videos.total / result.videos.pageSize),
  );
  const basePath = `/tag/${slug}`;
  const pagerQuery = {
    sort: query.sort,
    duration: query.duration,
    date: query.date,
  };

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://gayvideo.fun/" },
      { "@type": "ListItem", position: 2, name: "Tags", item: "https://gayvideo.fun/tags" },
      { "@type": "ListItem", position: 3, name: result.tag.name, item: `https://gayvideo.fun${basePath}` },
    ],
  };

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <Link href="/">Home</Link><span>›</span>
        <span>Tags</span><span>›</span>
        <span>{result.tag.name}</span>
      </nav>

      <header className={styles.hero}>
        <span className={styles.hash}>#</span>
        <div>
          <h1>{result.tag.name}</h1>
          <p>{result.tag.count.toLocaleString("en-US")} videos</p>
        </div>
      </header>

      {result.relatedTags.length ? (
        <div className={styles.related}>
          {result.relatedTags.map((tag) => (
            <TagChip key={tag.slug} href={`/tag/${tag.slug}`}>
              #{tag.name}
            </TagChip>
          ))}
        </div>
      ) : null}

      <div className={styles.controls}>
        <nav aria-label="Sort tag videos">
          {[
            ["trending", "Trending"],
            ["newest", "Newest"],
            ["most-viewed", "Most Viewed"],
          ].map(([value, label]) => (
            <Link
              key={value}
              className={(query.sort || "trending") === value ? styles.active : ""}
              href={`${basePath}?sort=${value}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <details>
          <summary>Filter</summary>
          <form method="get">
            <input type="hidden" name="sort" value={query.sort || "trending"} />
            <label>
              Duration
              <select name="duration" defaultValue={query.duration || ""}>
                <option value="">Any</option>
                <option value="under-5">Under 5 min</option>
                <option value="5-15">5–15 min</option>
                <option value="15-30">15–30 min</option>
                <option value="30-plus">30+ min</option>
              </select>
            </label>
            <label>
              Upload date
              <select name="date" defaultValue={query.date || ""}>
                <option value="">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </label>
            <button type="submit">Apply</button>
          </form>
        </details>
      </div>

      {result.videos.items.length ? (
        <>
          <div className={styles.videoGrid}>
            {result.videos.items.map((video, index) => (
              <VideoCard
                key={video.id}
                video={video}
                priority={index < 5}
              />
            ))}
          </div>

          <div className={styles.adWrap}>
            <AdSlot variant="in-feed" html={adHtml} />
          </div>

          <LoadMore
            initialCount={result.videos.items.length}
            total={result.videos.total}
            nextHref={result.videos.nextHref}
            pagerId="tag-pagination"
          />

          <Pagination
            page={result.videos.page}
            totalPages={totalPages}
            basePath={basePath}
            query={pagerQuery}
            id="tag-pagination"
          />
        </>
      ) : (
        <EmptyState
          icon="filter_alt_off"
          title="No videos match these filters"
          body="Clear the filters to see all videos with this tag."
          actions={<Link href={basePath}>Clear filters</Link>}
        />
      )}
    </main>
  );
}
