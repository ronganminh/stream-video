import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loadThumbnailPreferences } from "@/lib/sync/thumbnailSources";

import { bulkApproveReviewAction } from "./actions";
import { BulkApproveButton } from "./BulkApproveButton";
import styles from "./page.module.css";
import type { ReviewItem } from "./ReviewCard";
import { ReviewQueue } from "./ReviewQueue";
import { REVIEW_PAGE_SIZE } from "./reviewState";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DRAFT_WHERE = { isPublished: false, isHidden: false };

function pageNumber(value: string | string[] | undefined): number {
  const page = Number(typeof value === "string" ? value : undefined);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default async function AdminReviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const requestedPage = pageNumber((await searchParams).page);

  const total = await db.video.count({ where: DRAFT_WHERE });
  const totalPages = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  // Ten cards per page: each is ~1,100px with a player and up to four
  // third-party thumbnails, and every approve re-renders the page.
  const [videos, categories, tags] = await Promise.all([
    db.video.findMany({
      where: DRAFT_WHERE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        videoTags: { select: { tagId: true } },
        mirrors: {
          where: { status: "OK" },
          include: { host: true },
          orderBy: { host: { sortOrder: "asc" } },
        },
      },
      skip: (page - 1) * REVIEW_PAGE_SIZE,
      take: REVIEW_PAGE_SIZE,
    }),
    db.category.findMany({
      orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    db.tag.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const thumbnailPreferences = await loadThumbnailPreferences(
    videos.map((video) => video.id),
  );

  const items: ReviewItem[] = videos.map((video) => {
    const preference = thumbnailPreferences.get(video.id);
    return {
      id: video.id,
      title: video.title,
      slug: video.slug,
      categoryId: video.categoryId,
      quality: video.quality,
      tagIds: video.videoTags.map(({ tagId }) => tagId),
      thumbnailPath: video.thumbnailPath,
      createdAt: video.createdAt.toISOString(),
      mirrors: video.mirrors.map((mirror) => ({
        id: mirror.id,
        hostLabel: mirror.host.label,
        embedUrl: mirror.embedUrl,
      })),
      thumbnailChoices: [
        ...(preference?.sourceUrl
          ? [{ id: "source", label: "Source", url: preference.sourceUrl }]
          : []),
        ...video.mirrors.flatMap((mirror) =>
          mirror.hostThumbnailUrl
            ? [{ id: mirror.hostId, label: mirror.host.label, url: mirror.hostThumbnailUrl }]
            : [],
        ),
      ],
      selectedThumbnail: preference?.selected ?? null,
    };
  });

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>CONTENT REVIEW</p>
          <h1>Review queue</h1>
          <p className={styles.intro}>
            Review draft metadata and playback before publishing.{" "}
            <span className={styles.queueCount}>
              {total} waiting
              {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
            </span>
          </p>
        </div>
        <div className={styles.headingActions}>
          <Link href="/admin/videos">All videos</Link>
          <form id="bulk-approve-form" action={bulkApproveReviewAction}>
            <BulkApproveButton disabled={!items.length} />
          </form>
        </div>
      </div>

      {items.length ? (
        <>
          <ReviewQueue items={items} categories={categories} tags={tags} />
          {totalPages > 1 ? (
            <nav className={styles.pagination} aria-label="Review queue pages">
              {page > 1 ? (
                <Link href={page === 2 ? "/admin/review" : `/admin/review?page=${page - 1}`}>
                  Previous
                </Link>
              ) : (
                <span aria-hidden="true" />
              )}
              <span>
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={`/admin/review?page=${page + 1}`}>Next</Link>
              ) : (
                <span aria-hidden="true" />
              )}
            </nav>
          ) : null}
        </>
      ) : (
        <section className={styles.empty}>
          <h2>Review queue is clear</h2>
          <p>New videos will appear here as drafts after sync.</p>
          <Link href="/admin/videos">Browse all videos</Link>
        </section>
      )}
    </main>
  );
}
