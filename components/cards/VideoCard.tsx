import Link from "next/link";

import { Badge, Icon } from "@/components/primitives";
import { formatViews, timeAgo } from "@/lib/format";
import type { VideoCard as VideoCardData } from "@/lib/types";

import { Thumbnail } from "./Thumbnail";
import styles from "./VideoCard.module.css";

export type VideoCardVariant =
  | "default"
  | "hot"
  | "new"
  | "watched"
  | "loading"
  | "removed"
  | "fallback";

type SharedProps = {
  className?: string;
};

type LoadingProps = SharedProps & {
  variant: "loading";
  video?: never;
  priority?: never;
  mostWatchedRank?: never;
};

type DataProps = SharedProps & {
  video: VideoCardData;
  variant?: Exclude<VideoCardVariant, "loading">;
  priority?: boolean;
  mostWatchedRank?: number;
};

export type VideoCardProps = LoadingProps | DataProps;

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function resolveVariant(
  video: VideoCardData,
  variant?: Exclude<VideoCardVariant, "loading">,
): Exclude<VideoCardVariant, "loading"> {
  if (variant) return variant;
  if (video.availability === "REMOVED") return "removed";
  if ((video.watchedProgress ?? 0) > 0) return "watched";
  if (video.hot) return "hot";
  if (video.isNew) return "new";
  return "default";
}

function progressPercent(progress?: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, (progress ?? 0) * 100));
}

export function VideoCard(props: VideoCardProps) {
  if (props.variant === "loading") {
    return (
      <article
        className={joinClasses(styles.card, styles.loadingCard, props.className)}
        role="status"
        aria-label="Loading video"
        data-gv-motion="pulse"
      >
        <div className={styles.skeletonThumb} aria-hidden="true" />
        <div className={styles.skeletonTitleWide} aria-hidden="true" />
        <div className={styles.skeletonTitleShort} aria-hidden="true" />
        <div className={styles.skeletonMeta} aria-hidden="true" />
      </article>
    );
  }

  const { video, priority = false, mostWatchedRank, className } = props;
  const variant = resolveVariant(video, props.variant);

  if (variant === "removed") {
    return (
      <article className={joinClasses(styles.card, styles.removedCard, className)}>
        <div className={styles.removedThumb} aria-hidden="true">
          <Icon name="block" className={styles.removedIcon} />
        </div>
        <div className={joinClasses(styles.title, styles.removedTitle)}>
          Video unavailable
        </div>
        <div className={styles.meta}>Removed</div>
      </article>
    );
  }

  const progress = progressPercent(video.watchedProgress);
  const topLeftBadge = mostWatchedRank ? (
    <Badge
      variant="most-watched"
      rank={mostWatchedRank}
      className={styles.mostWatchedBadge}
    />
  ) : variant === "hot" ? (
    <Badge variant="hot" className={styles.statusBadge} />
  ) : variant === "new" ? (
    <Badge variant="new" className={styles.statusBadge} />
  ) : null;

  return (
    <article className={joinClasses(styles.card, className)}>
      <Link
        href={`/watch/${video.slug}`}
        className={styles.cardLink}
        aria-label={video.title}
      >
        <Thumbnail
          src={video.thumbnailUrl}
          alt=""
          durationSeconds={video.durationSeconds}
          previewUrl={video.previewUrl}
          priority={priority}
          forceFallback={variant === "fallback"}
          zoomOnHover
        >
          {variant === "watched" ? (
            <div className={styles.watchedScrim} aria-hidden="true" />
          ) : null}

          {topLeftBadge ? (
            <span className={styles.topLeft}>{topLeftBadge}</span>
          ) : null}

          {video.quality ? (
            <span className={styles.topRight}>
              <Badge variant="quality" className={styles.qualityBadge}>
                {video.quality}
              </Badge>
            </span>
          ) : null}

          {variant === "watched" ? (
            <div className={styles.progressTrack} aria-hidden="true">
              <div
                className={styles.progressValue}
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </Thumbnail>

        <div className={styles.title}>{video.title}</div>
        <div className={styles.meta}>
          {formatViews(video.views)} • {timeAgo(video.publishedAt)}
        </div>
      </Link>
    </article>
  );
}
