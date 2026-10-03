import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdSlot } from "@/components/ads/AdSlot";
import { VideoCard } from "@/components/cards/VideoCard";
import { Icon, TagChip } from "@/components/primitives";
import { getWatch, getPopularTags } from "@/lib/data";
import { getAdHtml } from "@/lib/data/prisma/ads";
import { formatViews, timeAgo } from "@/lib/format";

import { Player } from "./Player";
import { ReportFlow } from "./ReportFlow";
import { WatchActions } from "./WatchActions";
import styles from "./page.module.css";

type Params = Promise<{ slug: string }>;

function isoDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return undefined;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `PT${minutes ? `${minutes}M` : ""}${secs ? `${secs}S` : ""}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getWatch(slug);
  if (!result) return {};

  const status = result.video.availability ?? "AVAILABLE";
  const noindex = status !== "AVAILABLE";
  return {
    title: `${result.video.title} | GayVideo.fun`,
    description: result.video.description || undefined,
    alternates: { canonical: `/watch/${slug}` },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
  };
}

function StatePanel({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className={styles.statePanel}>
      <Icon name={icon} />
      <h1>{title}</h1>
      <p>{body}</p>
    </div>
  );
}

export default async function WatchPage({ params }: { params: Params }) {
  const { slug } = await params;
  const result = await getWatch(slug);
  if (!result) notFound();

  const { video, mirrors } = result;
  const status = video.availability ?? "AVAILABLE";
  const [belowAd, sidebarAd, popularTags] = await Promise.all([
    getAdHtml("watch-below-player"),
    getAdHtml("watch-sidebar"),
    getPopularTags(),
  ]);

  if (status === "PROCESSING") {
    return (
      <div className={styles.page}>
        <StatePanel
          icon="hourglass_top"
          title="This video is processing"
          body="The video is not ready to play yet. Please check back later."
        />
      </div>
    );
  }

  if (status === "FAILED") {
    const next = video.upNext[0];
    return (
      <div className={styles.page}>
        <StatePanel
          icon="error_outline"
          title="This video is unavailable"
          body="Playback is not available for this video."
        />
        {next ? (
          <div className={styles.stateAction}>
            <Link href={`/watch/${next.slug}`}>Play next video</Link>
          </div>
        ) : null}
      </div>
    );
  }

  if (status === "REGION_RESTRICTED") {
    return (
      <div className={styles.page}>
        <StatePanel
          icon="public_off"
          title="This video is unavailable in your region"
          body="Playback is not available from your current region."
        />
      </div>
    );
  }

  if (status === "AGE_RESTRICTED") {
    return (
      <div className={styles.page}>
        <StatePanel
          icon="18_up_rating"
          title="Age-restricted video"
          body="This video requires age confirmation before playback."
        />
      </div>
    );
  }

  if (status === "REMOVED" || status === "BLOCKED") {
    return notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl ? [video.thumbnailUrl] : undefined,
    uploadDate: video.publishedAt,
    duration: isoDuration(video.durationSeconds),
    embedUrl: mirrors[0]?.embedUrl,
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: { "@type": "WatchAction" },
      userInteractionCount: video.views,
    },
  };

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className={styles.layout}>
        <section className={styles.main}>
          <Player
            videoId={video.id}
            title={video.title}
            posterUrl={video.thumbnailUrl}
            mirrors={mirrors}
          />

          <div className={styles.belowAd}>
            <AdSlot variant="leaderboard" html={belowAd} />
          </div>

          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span>›</span>
            <Link href={`/category/${video.category.slug}`}>
              {video.category.name}
            </Link>
            <span>›</span>
            <span>{video.title}</span>
          </nav>

          <h1 className={styles.title}>{video.title}</h1>
          <div className={styles.metaRow}>
            <span>{formatViews(video.views)} views</span>
            <span>•</span>
            <span>{timeAgo(video.publishedAt)}</span>
            {video.quality ? <span className={styles.quality}>{video.quality}</span> : null}
          </div>

          <WatchActions
            videoId={video.id}
            slug={video.slug}
            initialLikes={video.likes}
          />
          <ReportFlow
            videoId={video.id}
            slug={video.slug}
            title={video.title}
            thumbnailUrl={video.thumbnailUrl}
          />

          {video.tags.length ? (
            <div className={styles.tags}>
              {video.tags.map((tag) => (
                <TagChip key={tag.slug} href={`/tag/${tag.slug}`}>
                  #{tag.name}
                </TagChip>
              ))}
            </div>
          ) : null}

          {video.description ? (
            <section className={styles.description}>
              <h2>Description</h2>
              <p>{video.description}</p>
            </section>
          ) : null}

          {video.related.length ? (
            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <h2>More like this</h2>
              </div>
              <div className={styles.grid}>
                {video.related.map((item) => (
                  <VideoCard key={item.id} video={item} />
                ))}
              </div>
            </section>
          ) : null}

          {popularTags.length ? (
            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <h2>Related tags</h2>
              </div>
              <div className={styles.tags}>
                {popularTags.slice(0, 10).map((tag) => (
                  <TagChip key={tag.slug} href={`/tag/${tag.slug}`}>
                    #{tag.name}
                  </TagChip>
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <aside className={styles.sidebar}>
          {video.upNext.length ? (
            <section>
              <div className={styles.sectionHeading}>
                <h2>Up Next</h2>
              </div>
              <div className={styles.sideList}>
                {video.upNext.slice(0, 5).map((item) => (
                  <VideoCard key={item.id} video={item} />
                ))}
              </div>
            </section>
          ) : null}

          <AdSlot variant="rectangle" html={sidebarAd} />

          {video.popularNow.length ? (
            <section>
              <div className={styles.sectionHeading}>
                <h2>Popular</h2>
              </div>
              <div className={styles.sideList}>
                {video.popularNow.map((item) => (
                  <VideoCard key={item.id} video={item} />
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
