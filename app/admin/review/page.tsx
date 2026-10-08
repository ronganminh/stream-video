import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loadThumbnailPreferences } from "@/lib/sync/thumbnailSources";

import {
  approveReviewAction,
  bulkApproveReviewAction,
  rejectReviewAction,
  saveReviewAction,
} from "./actions";
import styles from "./page.module.css";
import { ThumbnailChoiceForm } from "./ThumbnailChoiceForm";

export default async function AdminReviewPage() {
  await requireAdmin();

  const [videos, categories, tags] = await Promise.all([
    db.video.findMany({
      where: {
        isPublished: false,
        isHidden: false,
      },
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        videoTags: {
          include: { tag: true },
        },
        mirrors: {
          where: { status: "OK" },
          include: { host: true },
          orderBy: { host: { sortOrder: "asc" } },
        },
      },
      take: 50,
    }),
    db.category.findMany({
      orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    db.tag.findMany({
      orderBy: { name: "asc" },
    }),
  ]);
  const thumbnailPreferences = await loadThumbnailPreferences(
    videos.map((video) => video.id),
  );

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>CONTENT REVIEW</p>
          <h1>Review queue</h1>
          <p className={styles.intro}>
            Review draft metadata and playback before publishing.
          </p>
        </div>
        <div className={styles.headingActions}>
          <Link href="/admin/videos">All videos</Link>
          <form id="bulk-approve-form" action={bulkApproveReviewAction}>
            <button type="submit" disabled={!videos.length}>
              Approve selected
            </button>
          </form>
        </div>
      </div>

      {videos.length ? (
        <div className={styles.queue}>
          {videos.map((video) => {
            const preview = video.mirrors[0];
            const selectedTags = new Set(
              video.videoTags.map(({ tagId }) => tagId),
            );
            const preference = thumbnailPreferences.get(video.id);
            const thumbnailChoices = [
              ...(preference?.sourceUrl
                ? [
                    {
                      id: "source",
                      label: "Source",
                      url: preference.sourceUrl,
                    },
                  ]
                : []),
              ...video.mirrors.flatMap((mirror) =>
                mirror.hostThumbnailUrl
                  ? [
                      {
                        id: mirror.hostId,
                        label: mirror.host.label,
                        url: mirror.hostThumbnailUrl,
                      },
                    ]
                  : [],
              ),
            ];

            return (
              <article className={styles.card} key={video.id}>
                <div className={styles.selectRow}>
                  <label>
                    <input
                      form="bulk-approve-form"
                      type="checkbox"
                      name="videoId"
                      value={video.id}
                    />
                    <span>Select for bulk approval</span>
                  </label>
                  <span>
                    Added {video.createdAt.toISOString()}
                  </span>
                </div>

                <div className={styles.previewGrid}>
                  <div
                    className={styles.thumbnail}
                    style={{
                      backgroundImage: video.thumbnailPath
                        ? `url("${video.thumbnailPath.replaceAll('"', "%22")}")`
                        : undefined,
                    }}
                    aria-label={
                      video.thumbnailPath
                        ? `Thumbnail for ${video.title}`
                        : "No thumbnail"
                    }
                  >
                    {!video.thumbnailPath ? <span>No thumbnail</span> : null}
                  </div>
                  <div className={styles.embed}>
                    {preview ? (
                      <iframe
                        src={preview.embedUrl}
                        title={`Preview: ${video.title}`}
                        loading="lazy"
                        allowFullScreen
                      />
                    ) : (
                      <div className={styles.noPreview}>
                        No playable mirror
                      </div>
                    )}
                  </div>
                </div>

                {thumbnailChoices.length ? (
                  <section
                    className={styles.thumbnailPicker}
                    aria-label={`Thumbnail choices for ${video.title}`}
                  >
                    <div className={styles.thumbnailPickerHeading}>
                      <strong>Thumbnail choices</strong>
                      <span>
                        Source is the default. Host thumbnails stay available
                        for review.
                      </span>
                    </div>
                    <div className={styles.thumbnailChoices}>
                      {thumbnailChoices.map((choice) => (
                        <ThumbnailChoiceForm
                          key={choice.id}
                          videoId={video.id}
                          choiceId={choice.id}
                          label={choice.label}
                          url={choice.url}
                          selected={preference?.selected === choice.id}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                <form className={styles.form} action={saveReviewAction}>
                  <input type="hidden" name="id" value={video.id} />
                  <div className={styles.twoColumns}>
                    <label className={styles.field}>
                      <span>Title</span>
                      <input
                        name="title"
                        defaultValue={video.title}
                        required
                        maxLength={240}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Slug</span>
                      <input
                        name="slug"
                        defaultValue={video.slug}
                        required
                        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        maxLength={240}
                      />
                    </label>
                  </div>

                  <div className={styles.twoColumns}>
                    <label className={styles.field}>
                      <span>Category</span>
                      <select
                        name="categoryId"
                        defaultValue={video.categoryId ?? ""}
                      >
                        <option value="">Uncategorized</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Quality</span>
                      <select
                        name="quality"
                        defaultValue={video.quality ?? ""}
                      >
                        <option value="">Not set</option>
                        <option value="HD">HD</option>
                        <option value="4K">4K</option>
                      </select>
                    </label>
                  </div>

                  <label className={styles.field}>
                    <span>Tags</span>
                    <select
                      name="tagId"
                      multiple
                      defaultValue={[...selectedTags]}
                      size={Math.min(6, Math.max(3, tags.length))}
                    >
                      {tags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className={styles.mirrorLine}>
                    <span>
                      {video.mirrors.length} playable mirror
                      {video.mirrors.length === 1 ? "" : "s"}
                    </span>
                    {video.mirrors.map((mirror) => (
                      <code key={mirror.id}>
                        {mirror.host.label}
                      </code>
                    ))}
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={styles.secondary}
                      type="submit"
                    >
                      Save draft
                    </button>
                    <button
                      formAction={approveReviewAction}
                      type="submit"
                    >
                      Approve &amp; publish
                    </button>
                    <button
                      className={styles.danger}
                      formAction={rejectReviewAction}
                      type="submit"
                      formNoValidate
                    >
                      Reject
                    </button>
                    <Link href={`/admin/videos/${video.id}`}>
                      Open full editor
                    </Link>
                  </div>
                </form>
              </article>
            );
          })}
        </div>
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
