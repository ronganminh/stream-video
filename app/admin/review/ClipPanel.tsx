"use client";

import { useState, useTransition } from "react";

import { recutXPostAction, runClipWorkflowNowAction } from "./actions";
import styles from "./page.module.css";

type Recent = {
  id: string;
  title: string;
  slug: string;
  label: string;
  tone: string;
  error: string | null;
  link: string | null;
  updatedAt: string;
  /** "retry" for failed posts, "recut" for clips not in Buffer yet. */
  recut: "retry" | "recut" | null;
};

const STATE_LABELS: Record<string, string> = {
  idle: "Không có việc",
  waiting: "Chờ duyệt xong (gộp lượt)",
  running: "Workflow đang chạy",
  dispatched: "Đã gọi workflow",
  error: "Lỗi gọi GitHub",
};

/**
 * X clip workflow status on /admin/review: what the dispatcher is doing, the
 * last X posts, and "Chạy cắt clip ngay" (no waiting for the debounce).
 */
export function ClipPanel({
  dispatch,
  preparing,
  configured,
  recent,
}: {
  dispatch: { state: string; message: string | null; at: string | null };
  preparing: number;
  configured: boolean;
  recent: Recent[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const runNow = () =>
    startTransition(async () => {
      setResult(await runClipWorkflowNowAction());
    });

  return (
    <section className={styles.clipPanel} aria-label="Bài X và cắt clip">
      <div className={styles.clipPanelHead}>
        <div>
          <strong>Bài X</strong>
          <span className={styles.xStatus} data-tone={dispatch.state === "error" ? "error" : preparing ? "busy" : "muted"}>
            {preparing} đang chờ cắt clip · {STATE_LABELS[dispatch.state] ?? dispatch.state}
          </span>
        </div>
        <button type="button" onClick={runNow} disabled={pending || !configured}>
          {pending ? "Đang gọi…" : "Chạy cắt clip ngay"}
        </button>
      </div>
      {!configured ? (
        <p className={styles.xError}>Chưa có GAYVIDEO_CLIP_DISPATCH trên server: duyệt vẫn lên web, nhưng clip X chưa được cắt.</p>
      ) : null}
      {dispatch.message ? (
        <p className={dispatch.state === "error" ? styles.xError : styles.xHint}>{dispatch.message}</p>
      ) : null}
      {result ? (
        <p className={result.ok ? styles.xHint : styles.xError} role="status">
          {result.message}
        </p>
      ) : null}
      {recent.length ? (
        <ul className={styles.clipRecent}>
          {recent.map((post) => (
            <li key={post.id}>
              <span className={styles.xStatus} data-tone={post.tone}>
                {post.label}
              </span>
              <span className={styles.clipRecentTitle}>{post.title}</span>
              {post.link ? (
                <a href={post.link} target="_blank" rel="noreferrer">
                  Xem trên X
                </a>
              ) : null}
              {post.recut ? (
                <button
                  type="button"
                  className={styles.clipRecut}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setResult(await recutXPostAction(post.id));
                    })
                  }
                >
                  {post.recut === "retry" ? "Thử lại" : "Cắt lại"}
                </button>
              ) : null}
              {post.error && (post.tone === "error" || post.tone === "busy") ? (
                <small className={styles.xError}>{post.error}</small>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
