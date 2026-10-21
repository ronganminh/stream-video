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
 *   moment they are clicked. The row's slot starts at the card's height and
 *   collapses onto the next card, which stays where the admin was looking
 *   (see DoneRow). The row keeps its slot through the server refresh. A
 *   failure brings the card back, edits intact, with the error.
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
  // Height of each card when it was approved/rejected: its row starts there.
  // A ref, written in the click handler, so it is there when the row mounts
  // whichever render that lands in.
  const fromHeights = useRef(new Map<string, number>());
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
    card: HTMLElement,
  ) => {
    const id = item.id;
    const title = String(formData.get("title") || item.title);
    const slug = String(formData.get("slug") || item.slug);
    setErrors((current) => without(current, id));
    setNotices((current) => without(current, id));
    if (intent !== "save") {
      fromHeights.current.set(id, card.getBoundingClientRect().height);
      // The browser is likely anchoring scroll on this card's slot (the
      // admin just clicked in it). It is about to collapse, so take the whole
      // slot out of anchor selection (excluding only the card would leave the
      // slot itself as the anchor) and anchor on the next card instead.
      // Browsers keep their anchor until the next scroll, so nudge the scroll
      // (net zero) to make them pick a new one. DoneRow undoes this.
      if (card.parentElement) card.parentElement.style.overflowAnchor = "none";
      const nudge = window.scrollY > 0 ? -1 : 1;
      window.scrollBy(0, nudge);
      window.scrollBy(0, -nudge);
    }

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
                fromHeight={() => fromHeights.current.get(id) ?? 0}
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
                onIntent={(intent, formData, card) => handleIntent(item, intent, formData, card)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** .doneRow's usual height (min-height plus borders). */
const ROW_HEIGHT = 54;

function DoneRow({
  entry,
  fromHeight,
  error,
  onUndo,
}: {
  entry: ReviewDone;
  /** Height of the card this row replaced, in px (0 if unknown). */
  fromHeight: () => number;
  error: string | null;
  onUndo: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // The card is ~1,000px tall and the row ~54px. Swapping one for the other
  // would yank everything below up by ~950px (CLS ~0.5). Instead the slot
  // opens at the card's exact height, with the row at its bottom, and an
  // empty spacer above the row collapses to nothing. The slot opts out of
  // scroll anchoring (see handleIntent), so the browser anchors on the next
  // card and scrolls along with the collapse: the next card and the row stay
  // put on screen and nothing shifts. With reduced motion the collapse is
  // instant, anchored the same way.
  //
  // The start size is rendered, not set in an effect: a single layout at the
  // row's height (e.g. forced by focus) would already move the next card.
  const [startRows] = useState(() => {
    const spacer = Math.max(0, fromHeight() - ROW_HEIGHT);
    return spacer > 0 ? `${spacer}px auto` : undefined;
  });

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const row = rowRef.current;
    if (!wrap || !row) return;
    const slot = wrap.parentElement;
    row.focus({ preventScroll: true });

    let frame = 0;
    if (startRows) {
      // Correct the estimate if the row wrapped, paint, then collapse.
      const spacer = Math.max(0, fromHeight() - row.getBoundingClientRect().height);
      wrap.style.gridTemplateRows = `${spacer}px auto`;
      void wrap.offsetHeight;
      wrap.style.transition = "";
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          // Only collapse as far as the page can scroll back to compensate.
          // Near the top of the page (first card) the rest stays as blank
          // space above the row rather than pulling the next card up.
          const keep = Math.max(0, Math.round(spacer - window.scrollY));
          wrap.style.gridTemplateRows = `${keep}px auto`;
        });
      });
    }

    return () => {
      cancelAnimationFrame(frame);
      // The card is back (undo or a failed action): it may anchor again.
      if (slot) slot.style.overflowAnchor = "";
    };
    // Only on mount: later outcome changes reuse the collapsed slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      ref={wrapRef}
      className={styles.doneSlot}
      style={startRows ? { gridTemplateRows: startRows, transition: "none" } : undefined}
    >
      <div className={styles.doneSpacer} aria-hidden="true" />
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
    </div>
  );
}
