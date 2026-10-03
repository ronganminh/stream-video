import Link from "next/link";

import { formatViews, timeAgo } from "@/lib/format";
import type { VideoCard as VideoCardData } from "@/lib/types";

import { Thumbnail } from "./Thumbnail";
import styles from "./CompactVideoCard.module.css";

export type CompactVideoCardVariant =
  | "sidebar"
  | "up-next"
  | "up-next-featured"
  | "ranked";

export type CompactVideoCardProps = {
  video: VideoCardData;
  variant?: CompactVideoCardVariant;
  rank?: number;
  countdownLabel?: string;
  countdownProgress?: number;
  priority?: boolean;
  className?: string;
};

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clampPercent(value?: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, (value ?? 0) * 100));
}

export function CompactVideoCard({
  video,
  variant = "sidebar",
  rank,
  countdownLabel,
  countdownProgress,
  priority = false,
  className,
}: CompactVideoCardProps) {
  const href = `/watch/${video.slug}`;
  const rankLabel = String(rank ?? 0).padStart(2, "0");

  if (variant === "up-next-featured") {
    return (
      <article className={joinClasses(styles.featuredRoot, className)}>
        <Link href={href} className={styles.featuredLink} aria-label={video.title}>
          <Thumbnail
            src={video.thumbnailUrl}
            alt=""
            durationSeconds={video.durationSeconds}
            priority={priority}
          >
            {countdownLabel ? (
              <span className={styles.countdown}>{countdownLabel}</span>
            ) : null}
            {countdownProgress !== undefined ? (
              <span className={styles.countdownTrack} aria-hidden="true">
                <span
                  className={styles.countdownValue}
                  style={{ width: `${clampPercent(countdownProgress)}%` }}
                />
              </span>
            ) : null}
          </Thumbnail>
          <span className={styles.featuredCopy}>
            <span className={styles.featuredTitle}>{video.title}</span>
            <span className={styles.featuredMeta}>
              {formatViews(video.views)} • {timeAgo(video.publishedAt)}
            </span>
          </span>
        </Link>
      </article>
    );
  }

  const ranked = variant === "ranked";
  const meta =
    variant === "up-next"
      ? `${formatViews(video.views)} • ${timeAgo(video.publishedAt)}`
      : formatViews(video.views);

  return (
    <article
      className={joinClasses(
        styles.root,
        styles[variant],
        className,
      )}
    >
      <Link href={href} className={styles.link} aria-label={video.title}>
        {ranked ? (
          <span className={styles.rank} aria-hidden="true">
            {rankLabel}
          </span>
        ) : null}

        <span className={styles.thumb}>
          <Thumbnail
            src={video.thumbnailUrl}
            alt=""
            durationSeconds={video.durationSeconds}
            priority={priority}
          />
        </span>

        <span className={styles.copy}>
          <span className={styles.title}>{video.title}</span>
          <span className={styles.meta}>{meta}</span>
        </span>
      </Link>
    </article>
  );
}
