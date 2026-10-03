"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { VideoCard } from "@/components/cards/VideoCard";
import { Icon } from "@/components/primitives";
import type { VideoCard as VideoCardData } from "@/lib/types";

import { loadLatestHomePage } from "./actions";
import styles from "./LoadMore.module.css";

type Props = {
  initialNextHref?: string;
  initialShown: number;
  total: number;
};

function pageFromHref(href: string): number {
  const query = href.split("?")[1] ?? "";
  const value = new URLSearchParams(query).get("page");
  const page = Number(value);
  return Number.isInteger(page) && page > 1 ? page : 2;
}

export function LoadMore({
  initialNextHref,
  initialShown,
  total,
}: Props) {
  const [items, setItems] = useState<VideoCardData[]>([]);
  const [nextHref, setNextHref] = useState(initialNextHref ?? null);
  const [isPending, startTransition] = useTransition();
  const shown = Math.min(total, initialShown + items.length);

  const loadMore = () => {
    if (!nextHref || isPending) return;

    const page = pageFromHref(nextHref);
    startTransition(async () => {
      const result = await loadLatestHomePage(page);
      setItems((current) => [...current, ...result.items]);
      setNextHref(result.nextHref);
    });
  };

  return (
    <>
      {items.length ? (
        <div className={styles.grid} aria-live="polite">
          {items.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : null}

      <div className={styles.controls}>
        {nextHref ? (
          <button
            className={styles.button}
            type="button"
            onClick={loadMore}
            disabled={isPending}
          >
            <span>{isPending ? "Loading…" : "Load more videos"}</span>
            <Icon name="expand_more" className={styles.icon} />
          </button>
        ) : null}

        <span className={styles.count} aria-live="polite">
          Showing {shown.toLocaleString("en-US")} of{" "}
          {total.toLocaleString("en-US")}
        </span>

        {initialNextHref ? (
          <noscript>
            <Link className={styles.fallback} href={initialNextHref}>
              Browse more latest videos
            </Link>
          </noscript>
        ) : null}
      </div>
    </>
  );
}
