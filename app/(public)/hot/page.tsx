import type { Metadata } from "next";
import Link from "next/link";

import { AdSlot } from "@/components/ads/AdSlot";
import { RankCard } from "@/components/cards/RankCard";
import { VideoCard } from "@/components/cards/VideoCard";
import { LoadMore } from "@/components/filters/LoadMore";
import { Pagination } from "@/components/filters/Pagination";
import { TagChip } from "@/components/primitives";
import { getHot, getPopularTags } from "@/lib/data";
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
    page: positivePage(one(params, "page")),
  };
}

function windowLabel(value?: string) {
  if (value === "week") return "This week";
  if (value === "month") return "This month";
  if (value === "all") return "All time";
  return "Today";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const query = parseQuery(await searchParams);
  const filtered = Boolean(query.window && query.window !== "today");
  const suffix = query.page > 1 ? " – Page " + query.page : "";
  const canonical = filtered
    ? "/hot"
    : query.page > 1
      ? "/hot?page=" + query.page
      : "/hot";

  return {
    title: "Hot Videos" + suffix + " | GayVideo.fun",
    alternates: { canonical },
    robots: filtered
      ? { index: false, follow: true }
      : { index: true, follow: true },
  };
}

export default async function HotPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = parseQuery(await searchParams);
  const [result, popularTags, desktopAd, mobileAd] = await Promise.all([
    getHot(query),
    getPopularTags(),
    getAdHtml("list-in-feed"),
    getAdHtml("mobile-in-feed"),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const isFirstPage = result.page === 1;
  const ranked = isFirstPage ? result.items.slice(0, 5) : [];
  const regular = isFirstPage ? result.items.slice(5) : result.items;
  const beforeAd = regular.slice(0, 10);
  const afterAd = regular.slice(10);

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://gayvideo.fun/" },
      { "@type": "ListItem", position: 2, name: "Hot", item: "https://gayvideo.fun/hot" },
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
        <span>Hot</span>
      </nav>

      <header className={styles.hero}>
        <div>
          <h1>Hot Right Now</h1>
          <p>What viewers are watching now</p>
        </div>
        <nav className={styles.windowTabs} aria-label="Hot time window">
          {[
            ["today", "Today"],
            ["week", "This Week"],
            ["month", "This Month"],
            ["all", "All Time"],
          ].map(([value, label]) => {
            const active = (query.window ?? "today") === value;
            return (
              <Link
                key={value}
                className={active ? styles.windowActive : undefined}
                href={value === "today" ? "/hot" : "/hot?window=" + value}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      {ranked.length ? (
        <section className={styles.rankSection}>
          <div className={styles.rankHeading}>
            <span className={styles.dot} aria-hidden="true" />
            <strong>Top 5 {windowLabel(query.window).toLowerCase()}</strong>
            <span>Ranked by views in this window, updated hourly</span>
          </div>
          <div className={styles.rankRail}>
            {ranked.map((video, index) => (
              <RankCard
                key={video.id}
                video={video}
                rank={index + 1}
                priority={index < 2}
              />
            ))}
          </div>
        </section>
      ) : null}

      {result.items.length ? (
        <>
          <section className={styles.listSection}>
            <h2>{isFirstPage ? "Hot videos" : "Hot videos · Page " + result.page}</h2>
            <div className={styles.grid}>
              {beforeAd.map((video, index) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  variant="hot"
                  priority={index < 5}
                />
              ))}
            </div>
          </section>

          <div className={styles.desktopAd}>
            <AdSlot variant="leaderboard" html={desktopAd} />
          </div>
          <div className={styles.mobileAd}>
            <AdSlot variant="in-feed" html={mobileAd} />
          </div>

          {afterAd.length ? (
            <section className={styles.moreSection}>
              <h2>More hot videos</h2>
              <div className={styles.grid}>
                {afterAd.map((video) => (
                  <VideoCard key={video.id} video={video} variant="hot" />
                ))}
              </div>
            </section>
          ) : null}

          {popularTags.length && isFirstPage ? (
            <section className={styles.tagsSection}>
              <h2>Popular tags</h2>
              <div className={styles.tags}>
                {popularTags.slice(0, 10).map((tag) => (
                  <TagChip key={tag.slug} href={"/tag/" + tag.slug}>
                    #{tag.name}
                    <span className={styles.tagCount}>
                      {tag.count.toLocaleString("en-US")}
                    </span>
                  </TagChip>
                ))}
              </div>
            </section>
          ) : null}

          <LoadMore
            initialCount={result.items.length}
            total={result.total}
            nextHref={result.nextHref}
            pagerId="hot-pagination"
          />
          <Pagination
            page={result.page}
            totalPages={totalPages}
            basePath="/hot"
            query={{ window: query.window }}
            id="hot-pagination"
          />
        </>
      ) : null}
    </main>
  );
}
