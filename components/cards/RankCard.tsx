import Link from "next/link";

import { Badge } from "@/components/primitives";
import { formatViews, timeAgo } from "@/lib/format";
import type { VideoCard as VideoCardData } from "@/lib/types";

import { Thumbnail } from "./Thumbnail";
import styles from "./RankCard.module.css";

export type RankCardProps = {
  video: VideoCardData;
  rank: number;
  className?: string;
  priority?: boolean;
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function RankCard({
  video,
  rank,
  className,
  priority = true,
}: RankCardProps) {
  const rankLabel = String(rank).padStart(2, "0");

  return (
    <article className={joinClasses(styles.root, className)}>
      <Link
        href={`/watch/${video.slug}`}
        className={styles.link}
        aria-label={`#${rank} ${video.title}`}
      >
        <span className={styles.rank} aria-hidden="true">
          {rankLabel}
        </span>

        <span className={styles.content}>
          <Thumbnail
            src={video.thumbnailUrl}
            alt=""
            durationSeconds={video.durationSeconds}
            previewUrl={video.previewUrl}
            priority={priority}
            ratio="rank"
            zoomOnHover
          >
            <span className={styles.trendingBadge}>
              <Badge variant="trending" className={styles.trendingBadgeStyle} />
            </span>
          </Thumbnail>

          <span className={styles.title}>{video.title}</span>
          <span className={styles.meta}>
            {formatViews(video.views)} • {timeAgo(video.publishedAt)}
          </span>
        </span>
      </Link>
    </article>
  );
}
