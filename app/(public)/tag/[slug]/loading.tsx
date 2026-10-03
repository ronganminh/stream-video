import { Skeleton } from "@/components/feedback/Skeleton";

import styles from "./page.module.css";

export default function TagLoading() {
  return (
    <main className={styles.page} aria-label="Loading tag">
      <div className={styles.videoGrid}>
        {Array.from({ length: 20 }, (_, index) => (
          <Skeleton key={index} shape="card" />
        ))}
      </div>
    </main>
  );
}
