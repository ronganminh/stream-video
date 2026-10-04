import type { Metadata } from "next";
import Link from "next/link";

import { AdSlot } from "@/components/ads/AdSlot";
import { VideoCard } from "@/components/cards/VideoCard";
import { EmptyState } from "@/components/feedback/EmptyState";
import { FilterToolbar } from "@/components/filters/FilterToolbar";
import { LoadMore } from "@/components/filters/LoadMore";
import { Pagination } from "@/components/filters/Pagination";
import { Icon } from "@/components/primitives";
import { getCategories, getLatest, getPopularTags } from "@/lib/data";
import { getAdHtml } from "@/lib/data/prisma/ads";
import { timeAgo } from "@/lib/format";

import styles from "./page.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" && value ? value : undefined;
}

function positivePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseQuery(params: Record<string, string | string[] | undefined>) {
  return {
    category: one(params, "category"),
    duration: one(params, "duration"),
    date: one(params, "date"),
    tag: one(params, "tag"),
    sort: one(params, "sort"),
    page: positivePage(one(params, "page")),
  };
}

function hasFilters(query: ReturnType<typeof parseQuery>) {
  return Boolean(
    query.category ||
      query.duration ||
      query.date ||
      query.tag ||
      (query.sort && query.sort !== "newest"),
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const query = parseQuery(await searchParams);
  const filtered = hasFilters(query);
  const suffix = query.page > 1 ? " – Page " + query.page : "";
  const canonical = filtered
    ? "/latest"
    : query.page > 1
      ? "/latest?page=" + query.page
      : "/latest";

  return {
    title: "Latest Videos" + suffix + " | GayVideo.fun",
    alternates: { canonical },
    robots: filtered
      ? { index: false, follow: true }
      : { index: true, follow: true },
  };
}

export default async function LatestPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = parseQuery(await searchParams);
  const [result, categories, tags, today, newest, desktopAd, mobileAd] =
    await Promise.all([
      getLatest(query),
      getCategories(),
      getPopularTags(),
      getLatest({ date: "today", page: 1 }),
      getLatest({ page: 1 }),
      getAdHtml("list-in-feed"),
      getAdHtml("mobile-in-feed"),
    ]);

  const categoryOptions = categories.map((category) => ({
    value: category.slug,
    label: category.name,
  }));
  const tagOptions = tags.map((tag) => ({
    value: tag.slug,
    label: tag.name,
  }));
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const isFirstPage = result.page === 1;
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const lastHour = isFirstPage
    ? result.items.filter((video) => new Date(video.publishedAt).getTime() >= hourAgo)
    : [];
  const earlier = isFirstPage
    ? result.items.filter((video) => new Date(video.publishedAt).getTime() < hourAgo)
    : result.items;
  const activeFilterCount = [
    query.category,
    query.duration,
    query.date,
    query.tag,
  ].filter(Boolean).length;
  const latestUpload = newest.items[0];

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://gayvideo.fun/" },
      { "@type": "ListItem", position: 2, name: "Latest", item: "https://gayvideo.fun/latest" },
    ],
  };

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">›</span>
        <span>Latest</span>
      </nav>

      <header className={styles.hero}>
        <h1>Latest Videos</h1>
        <p>
          {today.total.toLocaleString("en-US")} new today
          {latestUpload ? " · last upload " + timeAgo(latestUpload.publishedAt) : ""}
        </p>
      </header>

      <div className={styles.desktopFilters}>
        <FilterToolbar
          values={{
            category: query.category,
            duration: query.duration,
            date: query.date,
            tag: query.tag,
            sort: query.sort ?? "newest",
          }}
          categories={categoryOptions}
          tags={tagOptions}
          defaultSort="newest"
        />
      </div>

      <div className={styles.mobileControls}>
        <details>
          <summary>
            <Icon name="tune" />
            Filter{activeFilterCount ? " · " + activeFilterCount : ""}
          </summary>
          <form method="get">
            <input type="hidden" name="sort" value={query.sort ?? "newest"} />
            <label>
              Category
              <select name="category" defaultValue={query.category ?? ""}>
                <option value="">All</option>
                {categoryOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duration
              <select name="duration" defaultValue={query.duration ?? ""}>
                <option value="">Any</option>
                <option value="under-5">Under 5 min</option>
                <option value="5-15">5–15 min</option>
                <option value="15-30">15–30 min</option>
                <option value="30-plus">30+ min</option>
              </select>
            </label>
            <label>
              Upload date
              <select name="date" defaultValue={query.date ?? ""}>
                <option value="">All Time</option>
                <option value="today">Today</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
            <label>
              Tags
              <select name="tag" defaultValue={query.tag ?? ""}>
                <option value="">Any</option>
                {tagOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Apply filters</button>
          </form>
        </details>

        <form className={styles.mobileSort} method="get">
          {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
          {query.duration ? <input type="hidden" name="duration" value={query.duration} /> : null}
          {query.date ? <input type="hidden" name="date" value={query.date} /> : null}
          {query.tag ? <input type="hidden" name="tag" value={query.tag} /> : null}
          <Icon name="swap_vert" />
          <select name="sort" defaultValue={query.sort ?? "newest"} aria-label="Sort">
            <option value="newest">Newest</option>
            <option value="most-viewed">Most Viewed</option>
            <option value="longest">Longest</option>
          </select>
          <button type="submit" aria-label="Apply sort">
            <Icon name="arrow_forward" />
          </button>
        </form>

        {activeFilterCount || (query.sort && query.sort !== "newest") ? (
          <Link className={styles.clear} href="/latest">
            Clear
          </Link>
        ) : null}
      </div>

      {result.items.length ? (
        <>
          {isFirstPage && lastHour.length ? (
            <section className={styles.group}>
              <div className={styles.groupLabel}>
                <span>LAST HOUR</span>
                <small>{lastHour.length} VIDEOS</small>
              </div>
              <div className={styles.grid}>
                {lastHour.map((video, index) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    variant={index < 2 ? "new" : undefined}
                    priority={index < 5}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {isFirstPage ? (
            <>
              <div className={styles.desktopAd}>
                <AdSlot variant="leaderboard" html={desktopAd} />
              </div>
              <div className={styles.mobileAd}>
                <AdSlot variant="in-feed" html={mobileAd} />
              </div>
            </>
          ) : null}

          {earlier.length ? (
            <section className={styles.group}>
              <div className={styles.groupLabel}>
                <span>{isFirstPage ? "EARLIER TODAY" : "LATEST VIDEOS"}</span>
                {!isFirstPage ? <small>PAGE {result.page}</small> : null}
              </div>
              <div className={styles.grid}>
                {earlier.map((video, index) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    priority={!lastHour.length && index < 5}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <LoadMore
            initialCount={result.items.length}
            total={result.total}
            nextHref={result.nextHref}
            pagerId="latest-pagination"
          />
          <Pagination
            page={result.page}
            totalPages={totalPages}
            basePath="/latest"
            query={{
              category: query.category,
              duration: query.duration,
              date: query.date,
              tag: query.tag,
              sort: query.sort,
            }}
            id="latest-pagination"
          />
        </>
      ) : (
        <EmptyState
          icon="filter_alt_off"
          title="No videos match these filters"
          body="Clear the filters to see the latest videos."
          actions={<Link href="/latest">Clear filters</Link>}
        />
      )}
    </main>
  );
}
