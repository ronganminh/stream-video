import type { CSSProperties } from "react";

import styles from "./Skeleton.module.css";

export type SkeletonShape =
  | "card"
  | "rank"
  | "search-row"
  | "sidebar"
  | "text";

export type SkeletonProps = {
  shape?: SkeletonShape;
  rank?: number;
  className?: string;
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Bar({
  width,
  small = false,
}: {
  width: string;
  small?: boolean;
}) {
  return (
    <span
      className={small ? styles.barSmall : styles.bar}
      style={{ width } as CSSProperties}
      aria-hidden="true"
    />
  );
}

export function Skeleton({
  shape = "card",
  rank = 1,
  className,
}: SkeletonProps) {
  if (shape === "rank") {
    return (
      <div
        className={joinClasses(styles.skeleton, styles.rankShape, className)}
        aria-hidden="true"
        data-gv-motion="pulse"
      >
        <span className={styles.rankNumeral}>
          {String(rank).padStart(2, "0")}
        </span>
        <span className={styles.rankContent}>
          <span className={styles.rankThumb} />
          <Bar width="85%" />
          <Bar width="45%" small />
        </span>
      </div>
    );
  }

  if (shape === "search-row") {
    return (
      <div
        className={joinClasses(styles.skeleton, styles.searchRow, className)}
        aria-hidden="true"
        data-gv-motion="pulse"
      >
        <span className={styles.searchThumb} />
        <span className={styles.searchCopy}>
          <Bar width="95%" />
          <Bar width="70%" />
          <Bar width="40%" small />
          <span className={styles.chips}>
            <span className={styles.chipWide} />
            <span className={styles.chipNarrow} />
          </span>
        </span>
      </div>
    );
  }

  if (shape === "sidebar") {
    return (
      <div
        className={joinClasses(styles.skeleton, styles.sidebarShape, className)}
        aria-hidden="true"
        data-gv-motion="pulse"
      >
        <span className={styles.sidebarThumb} />
        <span className={styles.sidebarCopy}>
          <Bar width="90%" />
          <Bar width="60%" />
          <Bar width="40%" small />
        </span>
      </div>
    );
  }

  if (shape === "text") {
    return (
      <div
        className={joinClasses(styles.skeleton, styles.textShape, className)}
        aria-hidden="true"
        data-gv-motion="pulse"
      >
        <Bar width="82%" />
        <Bar width="64%" />
        <Bar width="72%" />
      </div>
    );
  }

  return (
    <div
      className={joinClasses(styles.skeleton, styles.cardShape, className)}
      aria-hidden="true"
      data-gv-motion="pulse"
    >
      <span className={styles.cardThumb} />
      <Bar width="90%" />
      <Bar width="55%" small />
    </div>
  );
}
