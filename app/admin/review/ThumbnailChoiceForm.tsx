"use client";

import { useActionState } from "react";

import {
  INITIAL_THUMBNAIL_STATE,
  selectReviewThumbnailAction,
} from "./actions";
import styles from "./page.module.css";

type Props = {
  videoId: string;
  choiceId: string;
  label: string;
  url: string;
  selected: boolean;
};

export function ThumbnailChoiceForm({
  videoId,
  choiceId,
  label,
  url,
  selected,
}: Props) {
  const [state, formAction, pending] = useActionState(
    selectReviewThumbnailAction,
    INITIAL_THUMBNAIL_STATE,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={videoId} />
      <input type="hidden" name="selection" value={choiceId} />
      <button
        className={[
          styles.thumbnailChoice,
          selected ? styles.thumbnailChoiceSelected : "",
        ]
          .filter(Boolean)
          .join(" ")}
        type="submit"
        aria-pressed={selected}
        disabled={pending}
      >
        <span
          className={styles.thumbnailChoiceImage}
          style={{
            backgroundImage: `url("${url.replaceAll('"', "%22")}")`,
          }}
          aria-hidden="true"
        />
        <span className={styles.thumbnailChoiceMeta}>
          <span>{label}</span>
          {selected ? <em>Selected</em> : null}
          {pending ? <em>Saving…</em> : null}
        </span>
      </button>
      {state.ok === false && state.error ? (
        <span className={styles.thumbnailChoiceError} role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
