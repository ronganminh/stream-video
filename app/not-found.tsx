import Link from "next/link";

import { RankCard } from "@/components/cards/RankCard";
import { Icon } from "@/components/primitives";
import { Header } from "@/components/shell/Header";
import { MobileHeader } from "@/components/shell/MobileHeader";
import { getHot } from "@/lib/data";

import styles from "./not-found.module.css";

export default async function NotFound() {
  const trending = await getHot({ page: 1 });

  return (
    <>
      <Header />
      <MobileHeader />

      <main className={styles.page}>
        <section className={styles.hero}>
          <span className={styles.code}>ERROR 404</span>
          <h1>Lost the video?</h1>
          <p>We couldn&apos;t find this page.</p>

          <div className={styles.actions}>
            <Link className={styles.primary} href="/">
              <Icon name="home" />
              Go Home
            </Link>
            <Link className={styles.secondary} href="/hot">
              Browse Hot Videos
            </Link>
          </div>
        </section>

        {trending.items.length ? (
          <section className={styles.trending}>
            <div className={styles.heading}>
              <span aria-hidden="true" />
              <h2>Trending now</h2>
            </div>

            <div className={styles.rail}>
              {trending.items.slice(0, 3).map((video, index) => (
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
      </main>
    </>
  );
}
