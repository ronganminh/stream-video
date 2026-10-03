import Link from "next/link";
import { notFound } from "next/navigation";

import { VideoCard } from "@/components/cards/VideoCard";
import { Icon } from "@/components/primitives";
import { getWatch } from "@/lib/data";

import styles from "./page.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

export default async function GoneWatchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const slug = one(await searchParams, "slug");
  if (!slug) notFound();

  const result = await getWatch(slug);
  if (!result) notFound();

  const { video } = result;
  if (video.availability !== "REMOVED" && video.availability !== "BLOCKED") {
    notFound();
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <Icon name="block" />
        <span className={styles.eyebrow}>UNAVAILABLE</span>
        <h1>This video is no longer available</h1>
        <p>
          This content may have been removed by the uploader or following a
          content review.
        </p>
        <div className={styles.actions}>
          <a href="#related">Browse related videos</a>
          <Link href="/">Go Home</Link>
        </div>
      </section>

      {video.related.length ? (
        <section id="related" className={styles.section}>
          <div className={styles.heading}>
            <h2>Related videos</h2>
          </div>
          <div className={styles.grid}>
            {video.related.slice(0, 8).map((item) => (
              <VideoCard key={item.id} video={item} />
            ))}
          </div>
        </section>
      ) : null}

      {video.popularNow.length ? (
        <section className={styles.section}>
          <div className={styles.heading}>
            <h2>Hot Right Now</h2>
            <Link href="/hot">See all</Link>
          </div>
          <div className={styles.grid}>
            {video.popularNow.slice(0, 5).map((item) => (
              <VideoCard key={item.id} video={item} variant="hot" />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
