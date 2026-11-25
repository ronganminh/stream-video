"use client";

import { useState } from "react";

import { CAPTION_BUDGET, checkCaption } from "@/lib/social/captionRules";
import { xWeight } from "@/lib/social/xText";

import styles from "./page.module.css";

export type XReviewState = {
  /** Default caption from the template in /admin/settings. */
  defaultCaption: string;
  /** Settings → "Mặc định đăng lên X": start on "Cắt clip", else "Không đăng X". */
  postByDefault: boolean;
  /** Existing post (e.g. from the Colab notebook), if any. */
  existing: {
    statusLabel: string;
    tone: string;
    caption: string;
    hasClip: boolean;
    locked: boolean;
    lastError: string | null;
  } | null;
};

type Props = {
  videoId: string;
  durationSeconds: number | null;
  state: XReviewState;
  bannedExtra: string[];
  clipSeconds: number;
  maxVideoSeconds: number;
};

function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * The X part of a review card. Fields are named xMode, xStart and xCaption;
 * approveReviewAction re-checks everything on the server.
 */
export function XPostFields({ videoId, durationSeconds, state, bannedExtra, clipSeconds, maxVideoSeconds }: Props) {
  const existing = state.existing;
  const [mode, setMode] = useState(
    existing?.hasClip && !existing.locked ? "keep" : existing || state.postByDefault ? "clip" : "none",
  );
  const [caption, setCaption] = useState(existing?.caption || state.defaultCaption);
  const { problems } = checkCaption(caption, bannedExtra);
  const weight = xWeight(caption.trim());
  const posting = mode !== "none";
  const clipLength = Math.min(clipSeconds || maxVideoSeconds, maxVideoSeconds);
  const tooLong = durationSeconds !== null && durationSeconds > maxVideoSeconds;
  const id = (name: string) => `${name}-${videoId}`;

  return (
    <fieldset className={styles.xBox} disabled={existing?.locked}>
      <legend>
        Đăng X
        {existing ? (
          <span className={styles.xStatus} data-tone={existing.tone} title={existing.lastError ?? undefined}>
            {existing.statusLabel}
          </span>
        ) : null}
      </legend>
      {existing?.locked ? (
        <p className={styles.xHint}>Bài X đã ở Buffer hoặc đã đăng, không thay đổi được từ đây.</p>
      ) : null}
      {existing?.lastError && !existing.locked ? <p className={styles.xError}>{existing.lastError}</p> : null}

      <div className={styles.xModes} role="radiogroup" aria-label="Cách đăng X">
        {existing?.hasClip ? (
          <label>
            <input type="radio" name="xMode" value="keep" checked={mode === "keep"} onChange={() => setMode("keep")} />
            Dùng clip đã có
          </label>
        ) : null}
        <label>
          <input type="radio" name="xMode" value="clip" checked={mode === "clip"} onChange={() => setMode("clip")} />
          Cắt clip ({clock(clipLength)})
        </label>
        <label>
          <input type="radio" name="xMode" value="full" checked={mode === "full"} onChange={() => setMode("full")} />
          Giữ nguyên
        </label>
        <label>
          <input type="radio" name="xMode" value="none" checked={mode === "none"} onChange={() => setMode("none")} />
          Không đăng X
        </label>
      </div>

      {mode === "clip" ? (
        <label className={styles.xInline} htmlFor={id("xStart")}>
          Bắt đầu từ giây
          <input id={id("xStart")} name="xStart" type="number" min={0} step={1} defaultValue={0} inputMode="numeric" />
          {durationSeconds ? <span>/ {clock(durationSeconds)}</span> : null}
        </label>
      ) : null}
      {mode === "full" && tooLong ? (
        <p className={styles.xWarning} role="status">
          Video dài {clock(durationSeconds!)}, quá giới hạn X {clock(maxVideoSeconds)} (X_MAX_VIDEO_SECONDS): sẽ tự cắt{" "}
          {clock(maxVideoSeconds)} đầu.
        </p>
      ) : null}

      {posting ? (
        <label className={styles.field} htmlFor={id("xCaption")}>
          <span>
            Caption X{" "}
            <small className={weight > CAPTION_BUDGET ? styles.xOver : undefined}>
              {weight}/{CAPTION_BUDGET}
              {weight > CAPTION_BUDGET ? " · sẽ bị cắt bớt" : ""} (link bài viết tự thêm sau)
            </small>
          </span>
          <textarea
            id={id("xCaption")}
            name="xCaption"
            rows={2}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            aria-invalid={problems.length > 0}
          />
          {problems.length ? (
            <small className={styles.xError} role="alert">
              {problems.join("; ")}: không duyệt được khi còn lỗi này.
            </small>
          ) : null}
        </label>
      ) : null}
    </fieldset>
  );
}
