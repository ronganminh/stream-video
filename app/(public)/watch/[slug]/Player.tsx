"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { preconnect } from "react-dom";

import { Icon } from "@/components/primitives";
import type { MirrorPublic } from "@/lib/types";

import styles from "./page.module.css";

// Some hosts take seconds to show their player; after this long, point at
// the other servers.
const SLOW_LOAD_MS = 6000;

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

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
  const [slow, setSlow] = useState(false);
  const [viewCounted, setViewCounted] = useState(false);
  const startedAtRef = useRef<number | null>(null);

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

  // Warm up the hosts' connections (DNS, TLS) before Play is pressed.
  for (const mirror of mirrors) {
    const origin = originOf(mirror.embedUrl);
    if (origin) preconnect(origin);
  }

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => window.clearTimeout(id);
  }, [loading, activeIndex]);

  useEffect(() => {
    if (!started || startedAtRef.current === null) return;
    const tick = () => {
      const seconds = Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000);
      window.dispatchEvent(new CustomEvent("gv:player-time", { detail: { seconds } }));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [started]);

  const play = () => {
    if (!activeMirror) return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
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
                <span>Loading {activeMirror.label}…</span>
                {slow && mirrors.length > 1 ? (
                  <span className={styles.playerSlow}>
                    Taking a while? Try another server below.
                  </span>
                ) : null}
              </div>
            ) : null}
            <iframe
              key={`${activeMirror.hostId}:${activeMirror.embedUrl}`}
              src={activeMirror.embedUrl}
              title={`${title} (${activeMirror.label})`}
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
              aria-label={`${mirror.label}, server ${index + 1} of ${mirrors.length}`}
            >
              {mirror.label}
            </button>
          ))}
        </div>
        <span className={styles.serverHelp}>Not playing? Try another server</span>
      </div>
    </div>
  );
}
