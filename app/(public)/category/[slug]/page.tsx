import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdSlot } from "@/components/ads/AdSlot";
import { VideoCard } from "@/components/cards/VideoCard";
import { EmptyState } from "@/components/feedback/EmptyState";
import { FilterToolbar } from "@/components/filters/FilterToolbar";
import { Pagination } from "@/components/filters/Pagination";
import { TagChip } from "@/components/primitives";
import { getCategory } from "@/lib/data";
import { getAdHtml } from "@/lib/data/prisma/ads";

import { CategoryLoadMore } from "./CategoryLoadMore";
import { getCategoryPageData } from "./data";
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

function cleanQuery(params: Record<string, string | string[] | undefined>) {
  return {
    sort: one(params, "sort"),
    duration: one(params, "duration"),
    date: one(params, "date"),
    page: positivePage(one(params, "page")),
  };
}

function filtered(query: ReturnType<typeof cleanQuery>) {
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
  const query = cleanQuery(raw);
  const result = await getCategory(slug, { page: 1 });
  if (!result) return {};

  const suffix = query.page > 1 ? ` – Page ${query.page}` : "";
  const basePath = `/category/${slug}`;
  const canonical = filtered(query)
    ? basePath
    : query.page > 1
      ? `${basePath}?page=${query.page}`
      : basePath;

  return {
    title: `${result.category.name} Videos${suffix} | GayVideo.fun`,
    description: result.category.description,
    alternates: { canonical },
    robots: filtered(query)
      ? { index: false, follow: true }
      : { index: true, follow: true },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const query = cleanQuery(raw);
  const [result, adHtml] = await Promise.all([
    getCategoryPageData(slug, query),
    getAdHtml("list-in-feed"),
  ]);
  if (!result) notFound();

  const { category, relatedTags, videos } = result;
  const totalPages = Math.max(1, Math.ceil(videos.total / videos.pageSize));
  const basePath = `/category/${slug}`;
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
      { "@type": "ListItem", position: 2, name: "Categories", item: "https://gayvideo.fun/categories" },
      { "@type": "ListItem", position: 3, name: category.name, item: `https://gayvideo.fun${basePath}` },
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
        <Link href="/categories">Categories</Link><span>›</span>
        <span>{category.name}</span>
      </nav>

      <header className={styles.hero}>
        <div
          className={styles.categoryImage}
          style={{
            backgroundImage: category.thumbnailUrl
              ? `url("${category.thumbnailUrl.replaceAll('"', "%22")}")`
              : undefined,
          }}
          aria-hidden="true"
        />
        <div>
          <h1>{category.name}</h1>
          <p className={styles.meta}>
            <strong>{category.count.toLocaleString("en-US")} videos</strong>
          </p>
          {category.description ? (
            <p className={styles.description}>{category.description}</p>
          ) : null}
        </div>
      </header>

      {relatedTags.length ? (
        <div className={styles.related}>
          <span>Related</span>
          {relatedTags.map((tag) => (
            <TagChip key={tag.slug} href={`/tag/${tag.slug}`}>
              #{tag.name}
            </TagChip>
          ))}
        </div>
      ) : null}

      <div className={styles.desktopFilters}>
        <FilterToolbar
          values={{
            sort: query.sort || "trending",
            duration: query.duration,
            date: query.date,
          }}
          defaultSort="trending"
        />
      </div>

      <div className={styles.mobileControls}>
        <nav aria-label="Sort videos">
          {[
            ["trending", "Trending"],
            ["newest", "Newest"],
            ["most-viewed", "Most Viewed"],
            ["longest", "Longest"],
          ].map(([value, label]) => (
            <Link
              key={value}
              className={(query.sort || "trending") === value ? styles.activeSort : ""}
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

      <div className={styles.resultCount}>
        {videos.total.toLocaleString("en-US")} videos
      </div>

      {videos.items.length ? (
        <>
          <div className={styles.videoGrid}>
            {videos.items.map((video, index) => (
              <VideoCard
                key={video.id}
                video={video}
                variant={(query.sort || "trending") === "trending" ? "hot" : undefined}
                priority={index < 5}
              />
            ))}
          </div>

          <div className={styles.adWrap}>
            <AdSlot variant="in-feed" html={adHtml} />
          </div>

          <CategoryLoadMore
            slug={slug}
            sort={query.sort}
            duration={query.duration}
            date={query.date}
            initialCount={videos.items.length}
            total={videos.total}
            nextHref={videos.nextHref}
          />

          <Pagination
            page={videos.page}
            totalPages={totalPages}
            basePath={basePath}
            query={pagerQuery}
            id="category-pagination"
          />
        </>
      ) : (
        <EmptyState
          icon="filter_alt_off"
          title="No videos match these filters"
          body="Clear the filters to see all videos in this category."
          actions={<Link href={basePath}>Clear filters</Link>}
        />
      )}
    </main>
  );
}
