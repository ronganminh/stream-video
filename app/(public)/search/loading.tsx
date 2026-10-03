import { Skeleton } from "@/components/feedback/Skeleton";

import styles from "./page.module.css";

export default function SearchLoading() {
  return (
    <main className={styles.page} aria-label="Loading search results">
      <div className={styles.loadingTitle} aria-hidden="true" />
      <div className={styles.loadingChips} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} data-gv-motion="pulse" />
        ))}
      </div>
      <div className={styles.videoGrid}>
        {Array.from({ length: 20 }, (_, index) => (
          <Skeleton key={index} shape="card" />
        ))}
      </div>
    </main>
  );
}
