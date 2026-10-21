"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./page.module.css";

// Thumbnails come from slow third-party hosts (seconds per image). The frame
// keeps a fixed 16:9 box (see .lazyThumb), and the image fades in once loaded
// instead of popping in.
export function LazyThumb({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const imageRef = useRef<HTMLImageElement>(null);

  // A cached image can finish before hydration attaches onLoad.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete) setState(image.naturalWidth > 0 ? "loaded" : "failed");
  }, [src]);

  return (
    <span className={[styles.lazyThumb, className].filter(Boolean).join(" ")}>
      {state === "failed" ? (
        <span className={styles.lazyThumbFailed}>Image unavailable</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          data-state={state}
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
        />
      )}
    </span>
  );
}
