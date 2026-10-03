"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/primitives";

import styles from "./page.module.css";

type Props = {
  videoId: string;
  slug: string;
  initialLikes: number;
};

const SAVE_PREFIX = "gv-saved:";

export function WatchActions({
  videoId,
  slug,
  initialLikes,
}: Props) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share");

  useEffect(() => {
    try {
      setSaved(localStorage.getItem(`${SAVE_PREFIX}${videoId}`) === "1");
    } catch {
      setSaved(false);
    }
  }, [videoId]);

  const like = async () => {
    if (liked) return;
    setLiked(true);

    try {
      const response = await fetch(
        `/api/videos/${encodeURIComponent(videoId)}/like`,
        {
          method: "POST",
          credentials: "same-origin",
        },
      );
      if (!response.ok) throw new Error("Like failed");

      const payload = (await response.json()) as { likes?: number };
      if (typeof payload.likes === "number") setLikes(payload.likes);
    } catch {
      setLiked(false);
    }
  };

  const save = () => {
    try {
      const next = !saved;
      if (next) {
        localStorage.setItem(`${SAVE_PREFIX}${videoId}`, "1");
      } else {
        localStorage.removeItem(`${SAVE_PREFIX}${videoId}`);
      }
      setSaved(next);
    } catch {
      setSaved((value) => !value);
    }
  };

  const share = async () => {
    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({ url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareLabel("Copied");
        window.setTimeout(() => setShareLabel("Share"), 1600);
      }
    } catch {
      // User cancellation and clipboard failure leave the action unchanged.
    }
  };

  const triggerReport = () => {
    window.dispatchEvent(
      new CustomEvent("gv:report", {
        detail: {
          videoId,
          slug,
          url: window.location.href,
        },
      }),
    );
  };

  return (
    <div className={styles.actions} aria-label="Video actions">
      <button type="button" onClick={like} aria-pressed={liked}>
        <Icon name="thumb_up" />
        <span>Like</span>
        <small>{likes.toLocaleString("en-US")}</small>
      </button>
      <button type="button" onClick={save} aria-pressed={saved}>
        <Icon name={saved ? "bookmark" : "bookmark_border"} />
        <span>{saved ? "Saved" : "Save"}</span>
      </button>
      <button type="button" onClick={share}>
        <Icon name="share" />
        <span>{shareLabel}</span>
      </button>
      <button type="button" onClick={triggerReport}>
        <Icon name="flag" />
        <span>Report</span>
      </button>
    </div>
  );
}
