import Image from "next/image";
import type { ImageLoaderProps } from "next/image";
import Link from "next/link";

import { Badge } from "@/components/primitives";
import type { Category } from "@/lib/types";

import styles from "./CategoryCard.module.css";

export type CategoryCardVariant = "tall" | "wide" | "mobile" | "trending";

export type CategoryCardProps = {
  category: Category;
  variant?: CategoryCardVariant;
  priority?: boolean;
  className?: string;
};

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function passthroughLoader({ src }: ImageLoaderProps) {
  return src;
}

function formatCount(count: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, count));
}

export function CategoryCard({
  category,
  variant = "tall",
  priority = false,
  className,
}: CategoryCardProps) {
  const showTrending = variant === "trending";

  return (
    <article className={joinClasses(styles.root, className)}>
      <Link
        href={`/category/${category.slug}`}
        className={joinClasses(styles.card, styles[variant])}
        aria-label={category.name}
      >
        {category.thumbnailUrl ? (
          <Image
            loader={passthroughLoader}
            unoptimized
            src={category.thumbnailUrl}
            alt=""
            width={640}
            height={variant === "tall" ? 800 : variant === "wide" ? 400 : 360}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            className={styles.image}
          />
        ) : (
          <span className={styles.fallback} aria-hidden="true" />
        )}

        <span className={styles.scrim} aria-hidden="true" />

        {showTrending ? (
          <Badge variant="trending" className={styles.trendingBadge} />
        ) : null}

        <span className={styles.copy}>
          <span className={styles.name}>{category.name}</span>
          <span className={styles.count}>{formatCount(category.count)} videos</span>
        </span>
      </Link>
    </article>
  );
}
