"use client";

import { useState } from "react";

import styles from "./page.module.css";

type Props = {
  embedUrl: string;
  title: string;
  hostLabel: string;
  posterUrl: string | null;
};

// A host player iframe costs a full third-party page (scripts, ads, video
// probes) even with loading="lazy" once it nears the viewport. Show the
// poster and only create the player when the admin asks for it.
export function PreviewFacade({ embedUrl, title, hostLabel, posterUrl }: Props) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <iframe
        src={embedUrl}
        title={`Preview: ${title}`}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.facade}
      onClick={() => setPlaying(true)}
      // Starts with the visible text so voice control users can say it.
      aria-label={`Play preview · ${hostLabel}: ${title}`}
    >
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterUrl} alt="" loading="lazy" decoding="async" />
      ) : null}
      <span className={styles.facadePlay} aria-hidden="true">
        ▶
      </span>
      <span className={styles.facadeLabel}>Play preview · {hostLabel}</span>
    </button>
  );
}
