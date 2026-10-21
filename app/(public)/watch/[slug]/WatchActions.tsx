"use client";

import { useCallback, useEffect, useState } from "react";

import { Toast } from "@/components/feedback/Toast";
import { Icon } from "@/components/primitives";

import styles from "./page.module.css";

type Props = {
  videoId: string;
  slug: string;
  title: string;
  initialLikes: number;
};

const SAVE_PREFIX = "gv-saved:";

export function WatchActions({
  videoId,
  slug,
  title,
  initialLikes,
}: Props) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(
    null,
  );

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

  // The system share sheet where there is one (mostly mobile), otherwise
  // copy the link and say so.
  const share = async () => {
    const url = `${window.location.origin}/watch/${slug}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // Closing the sheet is not a failure; anything else falls back to copy.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setToast({ message: "Link copied", tone: "success" });
    } catch {
      setToast({ message: "Couldn't copy the link", tone: "error" });
    }
  };

  const closeToast = useCallback(() => setToast(null), []);

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
        <span>Share</span>
      </button>
      <button type="button" onClick={triggerReport}>
        <Icon name="flag" />
        <span>Report</span>
      </button>
      <Toast
        open={toast !== null}
        message={toast?.message ?? ""}
        tone={toast?.tone}
        onClose={closeToast}
      />
    </div>
  );
}
