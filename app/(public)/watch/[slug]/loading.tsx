import { Skeleton } from "@/components/feedback/Skeleton";

import styles from "./page.module.css";

export default function WatchLoading() {
  return (
    <div className={styles.page} aria-label="Loading video">
      <div className={styles.layout}>
        <section>
          <div className={styles.playerSkeleton} data-gv-motion="pulse" />
          <div className={styles.loadingTitle} data-gv-motion="pulse" />
          <div className={styles.loadingMeta} data-gv-motion="pulse" />
        </section>
        <aside className={styles.sidebar}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} shape="sidebar" />
          ))}
        </aside>
      </div>
    </div>
  );
}
