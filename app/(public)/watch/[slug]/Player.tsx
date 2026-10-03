"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/primitives";
import type { MirrorPublic } from "@/lib/types";

import styles from "./page.module.css";

type Props = {
  videoId: string;
  title: string;
  posterUrl: string | null;
  mirrors: MirrorPublic[];
};

export function Player({
  videoId,
  title,
  posterUrl,
  mirrors,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewCounted, setViewCounted] = useState(false);

  const activeMirror = mirrors[activeIndex] ?? mirrors[0];
  const posterStyle = useMemo(
    () =>
      posterUrl
        ? {
            backgroundImage:
              'linear-gradient(rgba(0,0,0,.16), rgba(0,0,0,.28)), url("' +
              posterUrl.replaceAll('"', "%22") +
              '")',
          }
        : undefined,
    [posterUrl],
  );

  const play = () => {
    if (!activeMirror) return;
    setStarted(true);
    setLoading(true);

    if (!viewCounted) {
      setViewCounted(true);
      void fetch(`/api/videos/${encodeURIComponent(videoId)}/view`, {
        method: "POST",
        credentials: "same-origin",
      });
    }
  };

  const selectServer = (index: number) => {
    setActiveIndex(index);
    if (started) setLoading(true);
  };

  if (!activeMirror) {
    return (
      <div className={styles.playerUnavailable}>
        <Icon name="error" />
        <span>No playable server is available.</span>
      </div>
    );
  }

  return (
    <div className={styles.playerShell}>
      <div className={styles.playerFrame}>
        {!started ? (
          <button
            type="button"
            className={styles.poster}
            style={posterStyle}
            onClick={play}
            aria-label={`Play ${title}`}
          >
            <span className={styles.playButton} aria-hidden="true">
              <Icon name="play_arrow" />
            </span>
          </button>
        ) : (
          <>
            {loading ? (
              <div className={styles.playerLoading} role="status">
                <span className={styles.spinner} aria-hidden="true" />
                Loading player…
              </div>
            ) : null}
            <iframe
              key={`${activeMirror.hostId}:${activeMirror.embedUrl}`}
              src={activeMirror.embedUrl}
              title={`${title} — Server ${activeIndex + 1}`}
              loading="eager"
              allowFullScreen
              onLoad={() => setLoading(false)}
            />
          </>
        )}
      </div>

      <div className={styles.serverBar}>
        <span>Server</span>
        <div className={styles.serverButtons} role="group" aria-label="Video servers">
          {mirrors.map((mirror, index) => (
            <button
              key={mirror.hostId}
              type="button"
              className={index === activeIndex ? styles.serverActive : styles.serverButton}
              onClick={() => selectServer(index)}
              aria-pressed={index === activeIndex}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <span className={styles.serverHelp}>Not playing? Try another server</span>
      </div>
    </div>
  );
}
