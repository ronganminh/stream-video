"use client";

import Link from "next/link";
import { useRef, type FormEvent } from "react";

import { LazyThumb } from "./LazyThumb";
import { PreviewFacade } from "./PreviewFacade";
import styles from "./page.module.css";
import { ThumbnailChoiceForm } from "./ThumbnailChoiceForm";

export type ReviewItem = {
  id: string;
  title: string;
  slug: string;
  categoryId: string | null;
  quality: string | null;
  tagIds: string[];
  thumbnailPath: string | null;
  createdAt: string;
  mirrors: { id: string; hostLabel: string; embedUrl: string }[];
  thumbnailChoices: { id: string; label: string; url: string }[];
  selectedThumbnail: string | null;
};

export type ReviewIntent = "save" | "approve" | "reject";

type Option = { id: string; name: string };

type Props = {
  item: ReviewItem;
  categories: Option[];
  tags: Option[];
  /** The intent currently running for this card, if any. */
  pending: ReviewIntent | null;
  error: string | null;
  notice: string | null;
  hidden: boolean;
  onIntent: (intent: ReviewIntent, formData: FormData, card: HTMLElement) => void;
};

export function ReviewCard({
  item,
  categories,
  tags,
  pending,
  error,
  notice,
  hidden,
  onIntent,
}: Props) {
  const cardRef = useRef<HTMLElement>(null);
  const preview = item.mirrors[0];
  const busy = pending !== null;

  // One handler for all three buttons: the browser has already run native
  // validation (skipped for Reject via formNoValidate), and the submitter
  // tells us which button it was. Fields stay uncontrolled, so a failed
  // approve keeps whatever the admin typed.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !cardRef.current) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = (submitter?.value ?? "save") as ReviewIntent;
    onIntent(intent, new FormData(event.currentTarget), cardRef.current);
  };

  return (
    <article ref={cardRef} className={styles.card} hidden={hidden} aria-busy={busy}>
      <div className={styles.selectRow}>
        <label>
          <input form="bulk-approve-form" type="checkbox" name="videoId" value={item.id} />
          <span>Select for bulk approval</span>
        </label>
        <span>Added {item.createdAt}</span>
      </div>

      <div className={styles.previewGrid}>
        <div className={styles.thumbnail}>
          {item.thumbnailPath ? (
            <LazyThumb src={item.thumbnailPath} alt={`Thumbnail for ${item.title}`} />
          ) : (
            <span>No thumbnail</span>
          )}
        </div>
        <div className={styles.embed}>
          {preview ? (
            <PreviewFacade
              embedUrl={preview.embedUrl}
              title={item.title}
              hostLabel={preview.hostLabel}
              posterUrl={item.thumbnailPath}
            />
          ) : (
            <div className={styles.noPreview}>No playable mirror</div>
          )}
        </div>
      </div>

      {item.thumbnailChoices.length ? (
        <section
          className={styles.thumbnailPicker}
          aria-label={`Thumbnail choices for ${item.title}`}
        >
          <div className={styles.thumbnailPickerHeading}>
            <strong>Thumbnail choices</strong>
            <span>Source is the default. Host thumbnails stay available for review.</span>
          </div>
          <div className={styles.thumbnailChoices}>
            {item.thumbnailChoices.map((choice) => (
              <ThumbnailChoiceForm
                key={choice.id}
                videoId={item.id}
                choiceId={choice.id}
                label={choice.label}
                url={choice.url}
                selected={item.selectedThumbnail === choice.id}
              />
            ))}
          </div>
        </section>
      ) : null}

      <form className={styles.form} onSubmit={submit}>
        <input type="hidden" name="id" value={item.id} />
        <div className={styles.twoColumns}>
          <label className={styles.field}>
            <span>Title</span>
            <input name="title" defaultValue={item.title} required maxLength={240} />
          </label>
          <label className={styles.field}>
            <span>Slug</span>
            <input
              name="slug"
              defaultValue={item.slug}
              placeholder="From the title"
              maxLength={240}
            />
          </label>
        </div>

        <div className={styles.twoColumns}>
          <label className={styles.field}>
            <span>Category</span>
            <select name="categoryId" defaultValue={item.categoryId ?? ""}>
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
            <select name="quality" defaultValue={item.quality ?? ""}>
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
            defaultValue={item.tagIds}
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
            {item.mirrors.length} playable mirror{item.mirrors.length === 1 ? "" : "s"}
          </span>
          {item.mirrors.map((mirror) => (
            <code key={mirror.id}>{mirror.hostLabel}</code>
          ))}
        </div>

        {error ? (
          <p className={styles.cardError} role="alert">
            {error}
          </p>
        ) : null}
        {notice && !error ? (
          <p className={styles.cardNotice} role="status">
            {notice}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button
            className={styles.secondary}
            type="submit"
            name="intent"
            value="save"
            disabled={busy}
          >
            {pending === "save" ? "Saving…" : "Save draft"}
          </button>
          <button type="submit" name="intent" value="approve" disabled={busy}>
            {pending === "approve" ? "Publishing…" : "Approve & publish"}
          </button>
          <button
            className={styles.danger}
            type="submit"
            name="intent"
            value="reject"
            formNoValidate
            disabled={busy}
          >
            {pending === "reject" ? "Rejecting…" : "Reject"}
          </button>
          <Link href={`/admin/videos/${item.id}`}>Open full editor</Link>
        </div>
      </form>
    </article>
  );
}
