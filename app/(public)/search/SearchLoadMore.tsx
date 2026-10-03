"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { VideoCard } from "@/components/cards/VideoCard";
import { Icon } from "@/components/primitives";
import type { VideoCard as VideoCardData } from "@/lib/types";

import { loadSearchPage } from "./actions";
import styles from "./page.module.css";

type Props = {
  q: string;
  duration?: string;
  date?: string;
  category?: string;
  sort?: string;
  initialCount: number;
  total: number;
  nextHref?: string;
};

function pageFromHref(href: string) {
  const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  const page = Number(new URLSearchParams(query).get("page"));
  return Number.isInteger(page) && page > 1 ? page : 2;
}

export function SearchLoadMore({
  q,
  duration,
  date,
  category,
  sort,
  initialCount,
  total,
  nextHref: initialNextHref,
}: Props) {
  const [items, setItems] = useState<VideoCardData[]>([]);
  const [nextHref, setNextHref] = useState(initialNextHref);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const pagerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const pager = document.querySelector<HTMLElement>(
      '[data-gv-pagination="search-pagination"]',
    );
    pagerRef.current = pager;
    if (pager && initialNextHref) pager.hidden = true;

    return () => {
      if (pager) pager.hidden = false;
    };
  }, [initialNextHref]);

  const loadMore = () => {
    if (!nextHref || pending) return;

    const page = pageFromHref(nextHref);
    startTransition(async () => {
      try {
        const result = await loadSearchPage(q, {
          duration,
          date,
          category,
          sort,
          page,
        });

        setItems((current) => [...current, ...result.results]);
        setNextHref(result.nextHref);
        setError("");

        if (pagerRef.current) {
          pagerRef.current.hidden = Boolean(result.nextHref);
        }

        window.history.replaceState(
          window.history.state,
          "",
          nextHref,
        );
      } catch {
        if (pagerRef.current) pagerRef.current.hidden = false;
        setError("Couldn’t load more results. Use the pagination links below.");
      }
    });
  };

  return (
    <div className={styles.loadMore}>
      {items.length ? (
        <div className={styles.videoGrid}>
          {items.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : null}

      {nextHref ? (
        <button type="button" onClick={loadMore} disabled={pending}>
          {pending ? "Loading…" : "Load more videos"}
          <Icon name="expand_more" />
        </button>
      ) : null}

      <span>
        Showing {Math.min(total, initialCount + items.length).toLocaleString("en-US")} of{" "}
        {total.toLocaleString("en-US")}
      </span>

      {error ? <p role="status">{error}</p> : null}
    </div>
  );
}
