import type { Metadata } from "next";
import Link from "next/link";

import { AdSlot } from "@/components/ads/AdSlot";
import { CategoryCard } from "@/components/cards/CategoryCard";
import { RankCard } from "@/components/cards/RankCard";
import { VideoCard } from "@/components/cards/VideoCard";
import { Icon, TagChip } from "@/components/primitives";
import { getHome } from "@/lib/data";
import { getAdHtml } from "@/lib/data/prisma/ads";

import { LoadMore } from "./_home/LoadMore";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "GayVideo.fun",
  alternates: {
    canonical: "/",
  },
};

function SectionLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <Link className={styles.sectionLink} href={href}>
      <span>{children}</span>
      <Icon name="chevron_right" className={styles.sectionLinkIcon} />
    </Link>
  );
}

export default async function HomePage() {
  const [home, desktopAdHtml, mobileAdHtml] = await Promise.all([
    getHome(),
    getAdHtml("home-leaderboard"),
    getAdHtml("mobile-in-feed"),
  ]);

  const hasContent =
    home.trending.length > 0 ||
    home.hot.length > 0 ||
    home.popularCategories.length > 0 ||
    home.latest.items.length > 0 ||
    home.popularTags.length > 0;

  const newOnPage = home.latest.items.filter((video) => video.isNew).length;

  return (
    <div className={styles.page}>
      <nav className={styles.mobileQuickNav} aria-label="Home sections">
        <Link className={styles.mobileQuickActive} href="/">
          For you
        </Link>
        <Link href="/latest">Latest</Link>
        <Link href="/most-viewed">Most Viewed</Link>
        <Link href="/category/fitness">Fitness</Link>
      </nav>

      {!hasContent ? (
        <section className={styles.empty}>
          <Icon name="video_library" className={styles.emptyIcon} />
          <h1>No videos are available yet</h1>
          <p>Published videos will appear here when they are available.</p>
        </section>
      ) : (
        <>
          {home.trending.length ? (
            <section className={styles.trendingSection}>
              <div className={styles.sectionHeading}>
                <div className={styles.headingGroup}>
                  <h1>Trending now</h1>
                  <span className={styles.subtleLabel}>Updated hourly</span>
                </div>
                <SectionLink href="/most-viewed">See all</SectionLink>
              </div>

              <div className={styles.trendingRail}>
                {home.trending.map((video, index) => (
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

          {home.hot.length ? (
            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <div className={styles.hotHeading}>
                  <h2>Hot Right Now</h2>
                  <div className={styles.windowTabs} aria-label="Hot window">
                    <Link className={styles.windowActive} href="/hot?window=today">
                      Today
                    </Link>
                    <Link href="/hot?window=week">This Week</Link>
                    <Link href="/hot?window=month">This Month</Link>
                  </div>
                </div>
                <SectionLink href="/hot">See all</SectionLink>
              </div>

              <div className={styles.videoGrid}>
                {home.hot.slice(0, 10).map((video, index) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    variant="hot"
                    priority={index < 5}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <div className={styles.desktopAd}>
            <AdSlot variant="leaderboard" html={desktopAdHtml} />
          </div>
          <div className={styles.mobileAd}>
            <AdSlot variant="in-feed" html={mobileAdHtml} />
          </div>

          {home.popularCategories.length ? (
            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <h2>Popular Categories</h2>
                <SectionLink href="/categories">All categories</SectionLink>
              </div>

              <div className={styles.categoryGrid}>
                {home.popularCategories.map((category, index) => (
                  <CategoryCard
                    key={category.slug}
                    category={category}
                    variant="wide"
                    priority={index < 3}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {home.latest.items.length ? (
            <section className={styles.latestSection}>
              <div className={styles.sectionHeading}>
                <div className={styles.headingGroup}>
                  <h2>Latest Videos</h2>
                  {newOnPage > 0 ? (
                    <span className={styles.newCount}>
                      {newOnPage} NEW TODAY
                    </span>
                  ) : null}
                </div>
                <SectionLink href="/latest">See all</SectionLink>
              </div>

              <div className={styles.videoGrid}>
                {home.latest.items.map((video, index) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    variant={video.isNew ? "new" : undefined}
                    priority={index < 5}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {home.popularTags.length ? (
            <section className={styles.tagsSection}>
              <h2>Popular Tags</h2>
              <div className={styles.tags}>
                {home.popularTags.map((tag) => (
                  <TagChip key={tag.slug} href={`/tag/${tag.slug}`}>
                    <span className={styles.hash}>#</span>
                    {tag.name}
                    <span className={styles.tagCount}>
                      {tag.count.toLocaleString("en-US")}
                    </span>
                  </TagChip>
                ))}
              </div>
            </section>
          ) : null}

          {home.latest.items.length ? (
            <div className={styles.loadMoreWrap}>
              <LoadMore
                initialNextHref={home.latest.nextHref}
                initialShown={home.latest.items.length}
                total={home.latest.total}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
