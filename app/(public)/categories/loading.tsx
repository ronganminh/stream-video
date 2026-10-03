import { Skeleton } from "@/components/feedback/Skeleton";

import styles from "./page.module.css";

export default function CategoriesLoading() {
  return (
    <main className={styles.page} aria-label="Loading categories">
      <div className={styles.loadingTitle} aria-hidden="true" />
      <div className={styles.categoryGrid}>
        {Array.from({ length: 12 }, (_, index) => (
          <Skeleton key={index} shape="card" />
        ))}
      </div>
    </main>
  );
}
