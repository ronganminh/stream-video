import type { Metadata } from "next";
import Link from "next/link";

import { AdSlot } from "@/components/ads/AdSlot";
import { VideoCard } from "@/components/cards/VideoCard";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadMore } from "@/components/filters/LoadMore";
import { Pagination } from "@/components/filters/Pagination";
import { Icon } from "@/components/primitives";
import { getMostViewed } from "@/lib/data";
import { getAdHtml } from "@/lib/data/prisma/ads";

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
    window: one(params, "window"),
    sort: one(params, "sort"),
    page: positivePage(one(params, "page")),
  };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const query = parseQuery(await searchParams);
  const nonDefaultWindow = Boolean(query.window && query.window !== "all");
  const nonDefaultSort = Boolean(query.sort && query.sort !== "most-viewed" && query.sort !== "views");
  const filtered = nonDefaultWindow || nonDefaultSort;
  const suffix = query.page > 1 ? " – Page " + query.page : "";
  const canonical = filtered
    ? "/most-viewed"
    : query.page > 1
      ? "/most-viewed?page=" + query.page
      : "/most-viewed";

  return {
    title: "Most Viewed Videos" + suffix + " | GayVideo.fun",
    alternates: { canonical },
    robots: filtered
      ? { index: false, follow: true }
      : { index: true, follow: true },
  };
}

export default async function MostViewedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = parseQuery(await searchParams);
  const [result, desktopAd, mobileAd] = await Promise.all([
    getMostViewed(query),
    getAdHtml("list-in-feed"),
    getAdHtml("mobile-in-feed"),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const first = result.items.slice(0, 13);
  const rest = result.items.slice(13);

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://gayvideo.fun/" },
      { "@type": "ListItem", position: 2, name: "Most Viewed", item: "https://gayvideo.fun/most-viewed" },
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
        <span>Most Viewed</span>
      </nav>

      <header className={styles.hero}>
        <div>
          <h1>Most Viewed</h1>
          <p>The most watched videos on GayVideo.fun</p>
        </div>

        <nav className={styles.windowTabs} aria-label="Most viewed time window">
          {[
            ["today", "Today"],
            ["week", "This Week"],
            ["month", "This Month"],
            ["all", "All Time"],
          ].map(([value, label]) => {
            const active = (query.window ?? "all") === value;
            return (
              <Link
                key={value}
                className={active ? styles.windowActive : undefined}
                href={value === "all" ? "/most-viewed" : "/most-viewed?window=" + value}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className={styles.sortLine}>
        <Icon name="swap_vert" />
        <span>Sort: Most Viewed</span>
      </div>

      {result.items.length ? (
        <>
          <div className={styles.grid}>
            {first.map((video, index) => (
              <div className={styles.rankedCard} key={video.id}>
                <VideoCard
                  video={video}
                  mostWatchedRank={index < 3 && result.page === 1 ? index + 1 : undefined}
                  priority={index < 5}
                />
                {index >= 3 || result.page > 1 ? (
                  <span className={styles.rankMeta}>
                    #{(result.page - 1) * result.pageSize + index + 1}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          <div className={styles.desktopAd}>
            <AdSlot variant="leaderboard" html={desktopAd} />
          </div>
          <div className={styles.mobileAd}>
            <AdSlot variant="in-feed" html={mobileAd} />
          </div>

          {rest.length ? (
            <div className={styles.grid}>
              {rest.map((video, index) => (
                <div className={styles.rankedCard} key={video.id}>
                  <VideoCard video={video} />
                  <span className={styles.rankMeta}>
                    #{(result.page - 1) * result.pageSize + 14 + index}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <LoadMore
            initialCount={result.items.length}
            total={result.total}
            nextHref={result.nextHref}
            pagerId="most-viewed-pagination"
          />
          <Pagination
            page={result.page}
            totalPages={totalPages}
            basePath="/most-viewed"
            query={{ window: query.window, sort: query.sort }}
            id="most-viewed-pagination"
          />
        </>
      ) : (
        <EmptyState
          icon="visibility"
          title="No viewed videos yet"
          body="Check back soon or explore the latest uploads."
          actions={
            <div className={styles.emptyActions}>
              <Link href="/latest">Browse Latest</Link>
              <Link href="/hot">Browse Hot</Link>
            </div>
          }
        />
      )}
    </main>
  );
}
