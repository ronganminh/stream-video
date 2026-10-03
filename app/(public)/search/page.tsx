import type { Metadata } from "next";
import Link from "next/link";

import { AdSlot } from "@/components/ads/AdSlot";
import { CategoryCard } from "@/components/cards/CategoryCard";
import { VideoCard } from "@/components/cards/VideoCard";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Pagination } from "@/components/filters/Pagination";
import { Icon, TagChip } from "@/components/primitives";
import {
  getCategories,
  getHot,
  getLatest,
  getPopularTags,
  search,
} from "@/lib/data";
import { getAdHtml } from "@/lib/data/prisma/ads";

import { SearchLoadMore } from "./SearchLoadMore";
import styles from "./page.module.css";

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

function parseQuery(params: Record<string, string | string[] | undefined>) {
  return {
    q: one(params, "q")?.trim() ?? "",
    duration: one(params, "duration"),
    date: one(params, "date"),
    category: one(params, "category"),
    sort: one(params, "sort"),
    page: positivePage(one(params, "page")),
  };
}

function searchCanonical(q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/search?${query}` : "/search";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const query = parseQuery(await searchParams);
  const suffix = query.page > 1 ? ` – Page ${query.page}` : "";
  const title = query.q
    ? `Search results for “${query.q}”${suffix} | GayVideo.fun`
    : `Search${suffix} | GayVideo.fun`;

  return {
    title,
    alternates: {
      canonical: searchCanonical(query.q),
    },
    robots: {
      index: false,
      follow: true,
    },
  };
}

function queryHref(
  q: string,
  patch: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);

  for (const [key, value] of Object.entries(patch)) {
    if (value) params.set(key, value);
  }

  return `/search?${params.toString()}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = parseQuery(await searchParams);

  const [result, categories, desktopAd, mobileAd] = await Promise.all([
    search(query.q, {
      duration: query.duration,
      date: query.date,
      category: query.category,
      sort: query.sort,
      page: query.page,
    }),
    getCategories(),
    getAdHtml("list-in-feed"),
    getAdHtml("mobile-in-feed"),
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(result.total / result.pageSize),
  );
  const pagerQuery = {
    q: query.q,
    duration: query.duration,
    date: query.date,
    category: query.category,
    sort: query.sort,
  };
  const activeFilterCount = [
    query.duration,
    query.date,
    query.category,
  ].filter(Boolean).length;

  const categoryOptions = categories.map((category) => ({
    value: category.slug,
    label: category.name,
  }));

  if (!result.results.length) {
    const [hot, latest, popularTags] = await Promise.all([
      getHot({ page: 1 }),
      getLatest({ page: 1 }),
      getPopularTags(),
    ]);

    return (
      <main className={styles.page}>
        <header className={styles.searchHeader}>
          <form className={styles.searchField} method="get" action="/search">
            <Icon name="search" className={styles.searchIcon} />
            <label className={styles.srOnly} htmlFor="search-empty-query">
              Search
            </label>
            <input
              id="search-empty-query"
              name="q"
              defaultValue={query.q}
              placeholder="Search videos, categories or tags"
              autoComplete="off"
            />
            <button type="submit" aria-label="Submit search">
              <Icon name="arrow_forward" />
            </button>
          </form>
        </header>

        <EmptyState
          icon="search_off"
          title={
            query.q
              ? `No videos found for “${query.q}”`
              : "Search for videos"
          }
          body={
            query.q
              ? "Try another search: check the spelling, use fewer words, or browse a tag below."
              : "Enter a title, category, or tag to start searching."
          }
          actions={
            <div className={styles.emptyActions}>
              <Link href="/hot">
                <Icon name="local_fire_department" />
                Browse Hot
              </Link>
              <Link href="/categories">All categories</Link>
            </div>
          }
        />

        {popularTags.length ? (
          <section className={styles.recoverySection}>
            <div className={styles.sectionHeading}>
              <h2>Popular tags</h2>
            </div>
            <div className={styles.tagRail}>
              {popularTags.slice(0, 10).map((tag) => (
                <TagChip key={tag.slug} href={`/tag/${tag.slug}`}>
                  #{tag.name}
                  <span className={styles.tagCount}>
                    {tag.count.toLocaleString("en-US")}
                  </span>
                </TagChip>
              ))}
            </div>
          </section>
        ) : null}

        {hot.items.length ? (
          <section className={styles.recoverySection}>
            <div className={styles.sectionHeading}>
              <h2>Hot Right Now</h2>
              <Link href="/hot">See all</Link>
            </div>
            <div className={styles.recoveryGrid}>
              {hot.items.slice(0, 5).map((video, index) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  variant="hot"
                  priority={index < 2}
                />
              ))}
            </div>
          </section>
        ) : null}

        {latest.items.length ? (
          <section className={styles.recoverySection}>
            <div className={styles.sectionHeading}>
              <h2>Latest Videos</h2>
              <Link href="/latest">See all</Link>
            </div>
            <div className={styles.recoveryGrid}>
              {latest.items.slice(0, 5).map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    );
  }

  const firstResults = result.results.slice(0, 10);
  const remainingResults = result.results.slice(10);

  return (
    <main className={styles.page}>
      <header className={styles.searchHeader}>
        <form className={styles.searchField} method="get" action="/search">
          <Icon name="search" className={styles.searchIcon} />
          <label className={styles.srOnly} htmlFor="search-query">
            Search
          </label>
          <input
            id="search-query"
            name="q"
            defaultValue={query.q}
            placeholder="Search videos, categories or tags"
            autoComplete="off"
          />
          <button type="submit" aria-label="Submit search">
            <Icon name="arrow_forward" />
          </button>
        </form>
      </header>

      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">›</span>
        <span>Search</span>
        {query.q ? (
          <>
            <span aria-hidden="true">›</span>
            <span>{query.q}</span>
          </>
        ) : null}
      </nav>

      <div className={styles.resultsHeading}>
        <div>
          <h1>
            {query.q ? (
              <>Results for “{query.q}”</>
            ) : (
              "Search results"
            )}
          </h1>
          <p>{result.total.toLocaleString("en-US")} videos</p>
        </div>
      </div>

      {result.relatedCategories.length ? (
        <section className={styles.relatedBlock}>
          <span className={styles.relatedLabel}>Categories</span>
          <div className={styles.categoryChips}>
            {result.relatedCategories.map((category) => (
              <Link
                key={category.slug}
                href={queryHref(query.q, {
                  category: category.slug,
                  duration: query.duration,
                  date: query.date,
                  sort: query.sort,
                })}
              >
                <span>{category.name}</span>
                <small>{category.count.toLocaleString("en-US")}</small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {result.relatedTags.length ? (
        <section className={styles.relatedBlock}>
          <span className={styles.relatedLabel}>Tags</span>
          <div className={styles.tagRail}>
            {result.relatedTags.map((tag) => (
              <TagChip key={tag.slug} href={`/tag/${tag.slug}`}>
                #{tag.name}
              </TagChip>
            ))}
          </div>
        </section>
      ) : null}

      <form className={styles.desktopFilters} method="get" action="/search">
        <input type="hidden" name="q" value={query.q} />

        <label>
          <span>Duration:</span>
          <select name="duration" defaultValue={query.duration ?? ""}>
            <option value="">Any</option>
            <option value="under-5">Under 5 min</option>
            <option value="5-15">5–15 min</option>
            <option value="15-30">15–30 min</option>
            <option value="30-plus">30+ min</option>
          </select>
        </label>

        <label>
          <span>Upload date:</span>
          <select name="date" defaultValue={query.date ?? ""}>
            <option value="">Any</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </label>

        <label>
          <span>Category:</span>
          <select name="category" defaultValue={query.category ?? ""}>
            <option value="">Any</option>
            {categoryOptions.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Sort:</span>
          <select name="sort" defaultValue={query.sort ?? ""}>
            <option value="">Relevance</option>
            <option value="newest">Newest</option>
            <option value="most-viewed">Most Viewed</option>
            <option value="longest">Longest</option>
          </select>
        </label>

        <button type="submit">Apply</button>
      </form>

      <div className={styles.mobileFilters}>
        <label className={styles.mobileSort}>
          <Icon name="swap_vert" />
          <span className={styles.srOnly}>Sort</span>
          <select
            name="sort"
            form="mobile-filter-form"
            defaultValue={query.sort ?? ""}
          >
            <option value="">Relevance</option>
            <option value="newest">Newest</option>
            <option value="most-viewed">Most Viewed</option>
            <option value="longest">Longest</option>
          </select>
        </label>

        <details>
          <summary>
            <Icon name="tune" />
            Filter{activeFilterCount ? ` · ${activeFilterCount}` : ""}
          </summary>
          <form id="mobile-filter-form" method="get" action="/search">
            <input type="hidden" name="q" value={query.q} />
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
                <option value="">Any</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </label>
            <label>
              Category
              <select name="category" defaultValue={query.category ?? ""}>
                <option value="">Any</option>
                {categoryOptions.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Apply filters</button>
          </form>
        </details>
      </div>

      <div className={styles.videoGrid}>
        {firstResults.map((video, index) => (
          <VideoCard
            key={video.id}
            video={video}
            priority={index < 5}
          />
        ))}
      </div>

      <div className={styles.desktopAd}>
        <AdSlot variant="leaderboard" html={desktopAd} />
      </div>
      <div className={styles.mobileAd}>
        <AdSlot variant="in-feed" html={mobileAd} />
      </div>

      {remainingResults.length ? (
        <div className={styles.videoGrid}>
          {remainingResults.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : null}

      <SearchLoadMore
        q={query.q}
        duration={query.duration}
        date={query.date}
        category={query.category}
        sort={query.sort}
        initialCount={result.results.length}
        total={result.total}
        nextHref={result.nextHref}
      />

      <Pagination
        page={result.page}
        totalPages={totalPages}
        basePath="/search"
        query={pagerQuery}
        id="search-pagination"
      />
    </main>
  );
}
