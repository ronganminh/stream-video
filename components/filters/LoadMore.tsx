"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { VideoCard } from "@/components/cards/VideoCard";
import { Skeleton } from "@/components/feedback/Skeleton";
import { Icon } from "@/components/primitives";
import type { ListPage, VideoCard as VideoCardData } from "@/lib/types";

import styles from "./LoadMore.module.css";

export type LoadMoreProps = {
  initialCount: number;
  total: number;
  nextHref?: string;
  pagerId?: string;
  skeletonCount?: number;
  className?: string;
};

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function publicHref(href: string) {
  const url = new URL(href, window.location.origin);
  return `${url.pathname}${url.search}${url.hash}`;
}

function apiHref(href: string) {
  const pageUrl = new URL(href, window.location.origin);
  const apiUrl = new URL("/api/list", window.location.origin);

  for (const [key, value] of pageUrl.searchParams.entries()) {
    apiUrl.searchParams.append(key, value);
  }

  apiUrl.searchParams.set("path", pageUrl.pathname);
  return apiUrl.toString();
}

export function LoadMore({
  initialCount,
  total,
  nextHref: initialNextHref,
  pagerId = "list-pagination",
  skeletonCount = 5,
  className,
}: LoadMoreProps) {
  const [items, setItems] = useState<VideoCardData[]>([]);
  const [nextHref, setNextHref] = useState(initialNextHref);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pagerRef = useRef<HTMLElement | null>(null);

  const shownCount = Math.min(total, initialCount + items.length);

  const skeletons = useMemo(
    () => Array.from({ length: skeletonCount }, (_, index) => index),
    [skeletonCount],
  );

  useEffect(() => {
    const pager = document.querySelector<HTMLElement>(
      `[data-gv-pagination="${CSS.escape(pagerId)}"]`,
    );
    pagerRef.current = pager;

    if (pager) {
      pager.hidden = true;
    }

    return () => {
      if (pager) {
        pager.hidden = false;
      }
    };
  }, [pagerId]);

  const revealFallbackPager = () => {
    if (pagerRef.current) {
      pagerRef.current.hidden = false;
    }
  };

  const loadNext = async () => {
    if (!nextHref || loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(apiHref(nextHref), {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error("Could not load more videos.");
      }

      const page = (await response.json()) as ListPage;

      setItems((current) => [...current, ...page.items]);
      setNextHref(page.nextHref);
      window.history.replaceState(
        window.history.state,
        "",
        publicHref(nextHref),
      );
    } catch {
      setError("Could not load more videos.");
      revealFallbackPager();
    } finally {
      setLoading(false);
    }
  };

  if (!initialNextHref && items.length === 0) {
    return (
      <div className={joinClasses(styles.root, className)}>
        <span className={styles.count} aria-live="polite">
          Showing {shownCount.toLocaleString("en-US")} of{" "}
          {total.toLocaleString("en-US")}
        </span>
      </div>
    );
  }

  return (
    <div className={joinClasses(styles.root, className)}>
      {items.length > 0 ? (
        <div className={styles.appendGrid}>
          {items.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className={styles.appendGrid} aria-hidden="true">
          {skeletons.map((index) => (
            <Skeleton key={index} shape="card" />
          ))}
        </div>
      ) : null}

      <div className={styles.controls}>
        {nextHref ? (
          <button
            type="button"
            className={styles.button}
            onClick={loadNext}
            disabled={loading}
            aria-busy={loading || undefined}
          >
            {loading ? "Loading…" : "Load more videos"}
            <Icon name="expand_more" className={styles.buttonIcon} />
          </button>
        ) : null}

        <span className={styles.count} aria-live="polite">
          Showing {shownCount.toLocaleString("en-US")} of{" "}
          {total.toLocaleString("en-US")}
        </span>

        {error ? (
          <span className={styles.error} role="status">
            {error} Use the pagination links below.
          </span>
        ) : null}
      </div>
    </div>
  );
}
