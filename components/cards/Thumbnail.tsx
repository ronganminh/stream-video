"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Badge, Icon } from "@/components/primitives";
import { formatDuration } from "@/lib/format";

import styles from "./Thumbnail.module.css";

const PREVIEW_EVENT = "gv-video-preview-start";
const PREVIEW_DELAY_MS = 500;

export type ThumbnailProps = {
  src: string | null;
  alt?: string;
  durationSeconds?: number | null;
  previewUrl?: string;
  priority?: boolean;
  ratio?: "video" | "rank";
  forceFallback?: boolean;
  zoomOnHover?: boolean;
  className?: string;
  children?: ReactNode;
};

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Thumbnail({
  src,
  alt = "",
  durationSeconds,
  previewUrl,
  priority = false,
  ratio = "video",
  forceFallback = false,
  zoomOnHover = false,
  className,
  children,
}: ThumbnailProps) {
  const instanceId = useId();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);

  const showFallback = forceFallback || !src || failed;
  const width = ratio === "rank" ? 640 : 640;
  const height = ratio === "rank" ? 400 : 360;

  const clearPreviewTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopPreview = () => {
    clearPreviewTimer();
    setPreviewActive(false);
  };

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setPreviewActive(false);
  }, [src, previewUrl, forceFallback]);

  useEffect(() => {
    const onPreviewStart = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail !== instanceId) {
        setPreviewActive(false);
      }
    };

    document.addEventListener(PREVIEW_EVENT, onPreviewStart);
    return () => document.removeEventListener(PREVIEW_EVENT, onPreviewStart);
  }, [instanceId]);

  useEffect(() => {
    return () => clearPreviewTimer();
  }, []);

  const canStartPreview = () => {
    if (!previewUrl || showFallback || typeof window === "undefined") {
      return false;
    }

    const desktopHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    return desktopHover && !reducedMotion;
  };

  const onPointerEnter = () => {
    if (!canStartPreview()) return;

    clearPreviewTimer();
    timerRef.current = setTimeout(() => {
      document.dispatchEvent(
        new CustomEvent<string>(PREVIEW_EVENT, { detail: instanceId }),
      );
      setPreviewActive(true);
      timerRef.current = null;
    }, PREVIEW_DELAY_MS);
  };

  const onPointerLeave = () => {
    stopPreview();
  };

  return (
    <div
      className={joinClasses(
        styles.thumbnail,
        ratio === "rank" ? styles.rankRatio : styles.videoRatio,
        zoomOnHover && styles.zoomOnHover,
        className,
      )}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {!showFallback && src ? (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          draggable={false}
          className={joinClasses(
            styles.image,
            loaded && styles.imageLoaded,
          )}
          data-gv-motion="zoom"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            setLoaded(false);
            stopPreview();
          }}
        />
      ) : null}

      {!showFallback && src && !loaded ? (
        <div className={styles.loadingSurface} aria-hidden="true" />
      ) : null}

      {showFallback ? (
        <div className={styles.fallback} aria-hidden="true">
          <svg
            viewBox="0 0 32 32"
            className={styles.fallbackMark}
            aria-hidden="true"
          >
            <rect
              width="32"
              height="32"
              rx="9"
              fill="var(--gv-surface-3)"
            />
            <path
              d="M22.6 10.2A8.6 8.6 0 1 0 24.6 16.5H20"
              stroke="var(--gv-text-secondary)"
              strokeWidth="3.2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M13.2 12.6v7.2l5.6-3.6z"
              fill="var(--gv-text-secondary)"
            />
          </svg>
          <span className={styles.fallbackLabel}>PREVIEW UNAVAILABLE</span>
        </div>
      ) : null}

      {previewActive && previewUrl ? (
        <video
          key={previewUrl}
          src={previewUrl}
          className={styles.previewVideo}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          tabIndex={-1}
          aria-hidden="true"
          data-gv-hover-preview
        />
      ) : null}

      {children}

      {previewUrl && !showFallback ? (
        <div className={styles.previewHud} aria-hidden="true" data-gv-hover-preview>
          <span className={styles.previewPlay}>
            <Icon name="play_arrow" className={styles.previewPlayIcon} />
          </span>
          <span className={styles.previewLabel}>
            <span className={styles.previewDot} />
            PREVIEW
          </span>
        </div>
      ) : null}

      {durationSeconds !== undefined ? (
        <Badge variant="duration" className={styles.duration}>
          {formatDuration(durationSeconds)}
        </Badge>
      ) : null}
    </div>
  );
}
