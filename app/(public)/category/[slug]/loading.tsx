import { Skeleton } from "@/components/feedback/Skeleton";

import styles from "./page.module.css";

export default function CategoryLoading() {
  return (
    <main className={styles.page} aria-label="Loading category">
      <div className={styles.videoGrid}>
        {Array.from({ length: 20 }, (_, index) => (
          <Skeleton key={index} shape="card" />
        ))}
      </div>
    </main>
  );
}
