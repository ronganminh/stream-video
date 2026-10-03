import type { HTMLAttributes, ReactNode } from "react";

import { Icon } from "./Icon";
import styles from "./Badge.module.css";

export type BadgeVariant =
  | "hot"
  | "trending"
  | "new"
  | "quality"
  | "duration"
  | "18+"
  | "ad"
  | "most-watched";

export type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  variant: BadgeVariant;
  children?: ReactNode;
  rank?: number;
};

const defaultLabels: Record<BadgeVariant, ReactNode> = {
  hot: "HOT",
  trending: "TRENDING",
  new: "NEW",
  quality: "4K",
  duration: "--:--",
  "18+": "18+",
  ad: "AD",
  "most-watched": "MOST WATCHED",
};

const variantClasses: Record<BadgeVariant, string> = {
  hot: styles.hot,
  trending: styles.trending,
  new: styles.new,
  quality: styles.quality,
  duration: styles.duration,
  "18+": styles.age,
  ad: styles.ad,
  "most-watched": styles.mostWatched,
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Badge({
  variant,
  children,
  rank,
  className,
  ...props
}: BadgeProps) {
  const label = children ?? defaultLabels[variant];

  return (
    <span
      {...props}
      className={joinClasses(styles.badge, variantClasses[variant], className)}
    >
      {variant === "hot" ? (
        <Icon name="local_fire_department" className={styles.hotIcon} />
      ) : null}
      {variant === "trending" ? (
        <Icon name="trending_up" className={styles.trendingIcon} />
      ) : null}
      {variant === "most-watched" && rank !== undefined ? (
        <span className={styles.rank}>#{rank}</span>
      ) : null}
      <span>{label}</span>
    </span>
  );
}
