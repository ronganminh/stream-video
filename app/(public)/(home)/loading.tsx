import { Skeleton } from "@/components/feedback/Skeleton";

import styles from "../page.module.css";

export default function HomeLoading() {
  return (
    <div className={styles.page} role="status" aria-label="Loading home">
      <section className={styles.trendingSection}>
        <div className={styles.loadingHeading} aria-hidden="true" />
        <div className={styles.trendingRail}>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} shape="rank" rank={index + 1} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.loadingHeading} aria-hidden="true" />
        <div className={styles.videoGrid}>
          {Array.from({ length: 10 }, (_, index) => (
            <Skeleton key={index} shape="card" />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.loadingHeading} aria-hidden="true" />
        <div className={styles.categorySkeletonGrid}>
          {Array.from({ length: 6 }, (_, index) => (
            <div
              className={styles.categorySkeleton}
              key={index}
              aria-hidden="true"
              data-gv-motion="pulse"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
