"use client";

import Link from "next/link";
import {
  startTransition,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
} from "react";

import {
  approveReviewAction,
  rejectReviewAction,
  saveReviewAction,
  undoApproveReviewAction,
  undoRejectReviewAction,
} from "./actions";
import styles from "./page.module.css";
import { ReviewCard, type ReviewIntent, type ReviewItem } from "./ReviewCard";
import {
  mergeQueueOrder,
  reviewErrorMessage,
  type ReviewActionResult,
  type ReviewDone,
} from "./reviewState";

type Option = { id: string; name: string };

const ACTIONS: Record<ReviewIntent, (formData: FormData) => Promise<ReviewActionResult>> = {
  save: saveReviewAction,
  approve: approveReviewAction,
  reject: rejectReviewAction,
};

function without<T>(record: Record<string, T>, id: string): Record<string, T> {
  if (!(id in record)) return record;
  const next = { ...record };
  delete next[id];
  return next;
}

async function run(
  action: (formData: FormData) => Promise<ReviewActionResult>,
  formData: FormData,
): Promise<ReviewActionResult> {
  try {
    return await action(formData);
  } catch (error) {
    return { ok: false, error: reviewErrorMessage(error) };
  }
}

/**
 * The review queue, updated optimistically:
 * - Approve/Reject swap the card for a one-line "Published · Undo" row the
 *   moment they are clicked, so the layout change lands right on the click
 *   (not ~300 ms later when the server answers) and the row keeps its slot
 *   through the server refresh. A failure brings the card back, edits intact,
 *   with the error.
 * - Buttons lock while their card has a request in flight.
 */
export function ReviewQueue({
  items,
  categories,
  tags,
}: {
  items: ReviewItem[];
  categories: Option[];
  tags: Option[];
}) {
  const [done, setDone] = useState<Record<string, ReviewDone>>({});
  const [optimisticDone, setOptimisticDone] = useOptimistic(
    done,
    (state, update: { id: string; done: ReviewDone }) => ({ ...state, [update.id]: update.done }),
  );
  const [pending, setPending] = useOptimistic<
    Record<string, ReviewIntent>,
    { id: string; intent: ReviewIntent }
  >({}, (state, update) => ({ ...state, [update.id]: update.intent }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notices, setNotices] = useState<Record<string, string>>({});

  // Keep slots stable across server refreshes (see mergeQueueOrder).
  const [seenItems, setSeenItems] = useState(items);
  const [order, setOrder] = useState(() => items.map((item) => item.id));
  if (items !== seenItems) {
    setSeenItems(items);
    setOrder(
      mergeQueueOrder(
        order,
        items.map((item) => item.id),
        Object.keys(optimisticDone),
      ),
    );
  }
  const itemsById = new Map(items.map((item) => [item.id, item]));

  const handleIntent = (
    item: ReviewItem,
    intent: ReviewIntent,
    formData: FormData,
  ) => {
    const id = item.id;
    const title = String(formData.get("title") || item.title);
    const slug = String(formData.get("slug") || item.slug);
    setErrors((current) => without(current, id));
    setNotices((current) => without(current, id));

    startTransition(async () => {
      setPending({ id, intent });
      if (intent !== "save") {
        setOptimisticDone({
          id,
          done: { outcome: intent === "approve" ? "publishing" : "rejecting", title, slug },
        });
      }

      const result = await run(ACTIONS[intent], formData);

      // Same transition as the optimistic row, so it hands over to the real
      // row without the card flashing back in between.
      startTransition(() => {
        if (!result.ok) {
          setErrors((current) => ({ ...current, [id]: result.error }));
        } else if (intent === "save") {
          setNotices((current) => ({ ...current, [id]: "Draft saved." }));
        } else {
          setDone((current) => ({
            ...current,
            [id]: { outcome: intent === "approve" ? "published" : "rejected", title, slug },
          }));
        }
      });
    });
  };

  const handleUndo = (id: string, entry: ReviewDone) => {
    const formData = new FormData();
    formData.set("id", id);
    setErrors((current) => without(current, id));

    startTransition(async () => {
      setOptimisticDone({ id, done: { ...entry, outcome: "restoring" } });
      const result = await run(
        entry.outcome === "published" ? undoApproveReviewAction : undoRejectReviewAction,
        formData,
      );
      startTransition(() => {
        if (result.ok) {
          setDone((current) => without(current, id));
        } else {
          setErrors((current) => ({ ...current, [id]: result.error }));
        }
      });
    });
  };

  return (
    <div className={styles.queue}>
      {order.map((id) => {
        const entry = optimisticDone[id];
        const item = itemsById.get(id);
        if (!entry && !item) return null;

        return (
          <div key={id} className={styles.slot}>
            {entry ? (
              <DoneRow
                entry={entry}
                error={errors[id] ?? null}
                onUndo={() => handleUndo(id, entry)}
              />
            ) : null}
            {item ? (
              <ReviewCard
                item={item}
                categories={categories}
                tags={tags}
                pending={pending[id] ?? null}
                error={entry ? null : errors[id] ?? null}
                notice={notices[id] ?? null}
                hidden={Boolean(entry)}
                onIntent={(intent, formData) => handleIntent(item, intent, formData)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function DoneRow({
  entry,
  error,
  onUndo,
}: {
  entry: ReviewDone;
  error: string | null;
  onUndo: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  // The row replaces a ~1,100px card. If the card's top was above the
  // viewport, the admin was reading its buttons; bring the row (and the next
  // card right under it) into view instead of leaving them mid-way through
  // the following card. Scrolling is not a layout shift.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    if (row.getBoundingClientRect().top < 0) {
      row.scrollIntoView({ block: "start" });
    }
    row.focus({ preventScroll: true });
  }, []);

  const busy = entry.outcome === "publishing" || entry.outcome === "rejecting" || entry.outcome === "restoring";
  const label = {
    publishing: "Publishing",
    published: "Published",
    rejecting: "Rejecting",
    rejected: "Rejected",
    restoring: "Restoring",
  }[entry.outcome];

  return (
    <div
      ref={rowRef}
      className={styles.doneRow}
      data-outcome={entry.outcome}
      tabIndex={-1}
      role="status"
      aria-busy={busy}
    >
      <span className={styles.doneLabel}>
        {label}
        {busy ? "…" : ""}
      </span>
      <span className={styles.doneTitle}>{entry.title}</span>
      {entry.outcome === "published" ? (
        <Link href={`/watch/${entry.slug}`} target="_blank" rel="noreferrer">
          View
        </Link>
      ) : null}
      {entry.outcome === "published" || entry.outcome === "rejected" ? (
        <button type="button" onClick={onUndo}>
          Undo
        </button>
      ) : null}
      {error ? (
        <span className={styles.doneError} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
