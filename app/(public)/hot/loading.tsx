import { Skeleton } from "@/components/feedback/Skeleton";

import styles from "./page.module.css";

export default function HotLoading() {
  return (
    <main className={styles.page} aria-label="Loading hot videos">
      <div className={styles.loadingTitle} aria-hidden="true" />
      <div className={styles.rankRail}>
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} shape="rank" rank={index + 1} />
        ))}
      </div>
      <div className={styles.grid}>
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton key={index} shape="card" />
        ))}
      </div>
    </main>
  );
}
