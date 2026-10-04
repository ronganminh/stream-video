import { Skeleton } from "@/components/feedback/Skeleton";

import styles from "./page.module.css";

export default function LatestLoading() {
  return (
    <main className={styles.page} aria-label="Loading latest videos">
      <div className={styles.loadingTitle} aria-hidden="true" />
      <div className={styles.loadingFilters} aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
      </div>
      <div className={styles.grid}>
        {Array.from({ length: 20 }, (_, index) => (
          <Skeleton key={index} shape="card" />
        ))}
      </div>
    </main>
  );
}
