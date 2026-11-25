import type { PrismaClient, SocialPost, SocialPostStatus } from "@prisma/client";

import { checkCaption } from "./captionRules";
import { deleteClip } from "./clips";
import type { SocialConfig } from "./config";
import { X_NETWORK } from "./queue";

// The X part of approving a video in /admin/review. The admin picks:
// - "clip": a short clip (X_CLIP_SECONDS, default 120 s) cut from a start time;
// - "full": the whole video, cut to X_MAX_VIDEO_SECONDS if longer (free X
//   accounts take ~140 s; raise it after upgrading to Premium);
// - "none": no X post;
// - "keep": use the clip already uploaded (e.g. by the Colab notebook).
// A GitHub Actions workflow then makes the clip (lib/social/dispatch.ts,
// lib/social/clipJobs.ts, .github/workflows/x-clips.yml).

export type XMode = "clip" | "full" | "none" | "keep";
export const X_MODES: readonly XMode[] = ["clip", "full", "none", "keep"];

export type XReviewInput = {
  mode: XMode;
  /** Clip start, in seconds (mode "clip"). */
  start: number;
  caption: string;
};

export type XPlan =
  | { action: "none" }
  | { action: "keep"; caption: string }
  | { action: "prepare"; mode: "clip" | "full"; caption: string; start: number; seconds: number };

export type XPlanResult = { plan: XPlan; warnings: string[]; errors: string[] };

/** Posts already in (or past) Buffer are never changed from review. */
export const LOCKED_STATUSES: readonly SocialPostStatus[] = ["pushing", "pushed", "sent"];

/** "1:05" for 65 seconds. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * How long the clip must be: the whole video up to X_MAX_VIDEO_SECONDS
 * ("full"), or X_CLIP_SECONDS from `start` ("clip"), never past the end of
 * the video when its duration is known. Used when approving and when an
 * admin asks for a recut (the stored clipSeconds is then the old clip's
 * real length, possibly a cut-off one).
 */
export function plannedClipSeconds(
  mode: "clip" | "full",
  start: number,
  durationSeconds: number | null,
  config: Pick<SocialConfig, "clipSeconds" | "maxVideoSeconds">,
): number {
  const duration = durationSeconds && durationSeconds > 0 ? durationSeconds : null;
  const limit = config.maxVideoSeconds;
  if (mode === "full") return duration === null ? limit : Math.min(duration, limit);
  const wanted = config.clipSeconds > 0 ? Math.min(config.clipSeconds, limit) : limit;
  return duration === null ? wanted : Math.max(1, Math.min(wanted, duration - start));
}

/** Reads the review form's X fields; unknown modes fall back to "clip". */
export function readXReviewInput(form: { get(name: string): unknown }): XReviewInput {
  const mode = String(form.get("xMode") ?? "clip") as XMode;
  const start = Number(String(form.get("xStart") ?? "0").replace(",", "."));
  return {
    mode: X_MODES.includes(mode) ? mode : "clip",
    start: Number.isFinite(start) && start > 0 ? Math.floor(start) : 0,
    caption: String(form.get("xCaption") ?? ""),
  };
}

/**
 * What approving should do for X. Errors stop the approval (the card shows
 * them); warnings are shown but do not block.
 */
export function planXPost(
  input: XReviewInput,
  video: { durationSeconds: number | null },
  existing: Pick<SocialPost, "status" | "clipFile"> | null,
  config: Pick<SocialConfig, "clipSeconds" | "maxVideoSeconds">,
  bannedExtra: readonly string[] = [],
): XPlanResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (existing && LOCKED_STATUSES.includes(existing.status)) {
    warnings.push("Bài X của video này đã ở Buffer hoặc đã đăng: không đổi.");
    return { plan: { action: "none" }, warnings, errors };
  }
  if (input.mode === "none") return { plan: { action: "none" }, warnings, errors };

  const { caption, problems } = checkCaption(input.caption, bannedExtra);
  if (problems.length) {
    errors.push(`Caption X: ${problems.join("; ")}. Sửa caption hoặc chọn "Không đăng X".`);
    return { plan: { action: "none" }, warnings, errors };
  }

  if (input.mode === "keep") {
    if (!existing?.clipFile) {
      errors.push('Chưa có clip X nào cho video này: chọn "Cắt clip" hoặc "Giữ nguyên".');
      return { plan: { action: "none" }, warnings, errors };
    }
    return { plan: { action: "keep", caption }, warnings, errors };
  }

  const duration = video.durationSeconds && video.durationSeconds > 0 ? video.durationSeconds : null;
  const limit = config.maxVideoSeconds;

  if (input.mode === "full") {
    if (duration !== null && duration > limit) {
      warnings.push(
        `Video dài ${clock(duration)}, quá giới hạn X ${clock(limit)} (X_MAX_VIDEO_SECONDS): sẽ tự cắt ${clock(limit)} đầu.`,
      );
    } else if (duration === null) {
      warnings.push(`Chưa biết thời lượng video: nếu dài hơn ${clock(limit)} sẽ tự cắt.`);
    }
    const seconds = plannedClipSeconds("full", 0, duration, config);
    return { plan: { action: "prepare", mode: "full", caption, start: 0, seconds }, warnings, errors };
  }

  // "clip"
  let start = input.start;
  if (duration !== null && start >= duration - 1) {
    warnings.push(`Giây bắt đầu ${clock(start)} vượt thời lượng ${clock(duration)}: cắt từ đầu.`);
    start = 0;
  }
  const seconds = plannedClipSeconds("clip", start, duration, config);
  return { plan: { action: "prepare", mode: "clip", caption, start, seconds }, warnings, errors };
}

type Db = Pick<PrismaClient, "socialPost">;

/**
 * Applies a plan for a video that was just published. Returns a warning to
 * show, if any. Never touches a post Buffer already has.
 */
export async function applyXPlan(
  client: Db,
  videoId: string,
  plan: XPlan,
  mediaDir?: string,
): Promise<void> {
  const existing = await client.socialPost.findUnique({
    where: { videoId_network: { videoId, network: X_NETWORK } },
  });
  if (existing && LOCKED_STATUSES.includes(existing.status)) return;

  if (plan.action === "none") {
    if (existing && existing.status !== "cancelled") {
      await client.socialPost.update({
        where: { id: existing.id },
        data: { status: "cancelled", clipFile: null, lastError: "Không đăng X (chọn khi duyệt)." },
      });
      await deleteClip(existing.clipFile, mediaDir);
    }
    return;
  }

  if (plan.action === "keep") {
    // The publish just made the video public: the queue promotes "waiting".
    await client.socialPost.update({
      where: { id: existing!.id },
      data: {
        caption: plan.caption,
        status: existing!.status === "failed" || existing!.status === "cancelled" ? "queued" : existing!.status,
        attempts: 0,
        lastError: null,
        nextAttemptAt: null,
      },
    });
    return;
  }

  const data = {
    status: "preparing" as const,
    caption: plan.caption,
    clipMode: plan.mode,
    clipStart: plan.start,
    // The target length; replaced by the real one once the clip exists.
    clipSeconds: plan.seconds,
    clipFile: null,
    clipSource: null,
    attempts: 0,
    lastError: null,
    nextAttemptAt: null,
    pushedAt: null,
  };
  if (existing) {
    await client.socialPost.update({ where: { id: existing.id }, data });
    await deleteClip(existing.clipFile, mediaDir);
  } else {
    await client.socialPost.create({ data: { ...data, videoId, network: X_NETWORK } });
  }
}

/** Undo of an approval: drop an X post that has not reached Buffer yet. */
export async function cancelUnsentXPost(client: Db, videoId: string, mediaDir?: string): Promise<void> {
  const existing = await client.socialPost.findUnique({
    where: { videoId_network: { videoId, network: X_NETWORK } },
  });
  if (!existing || !["preparing", "queued", "waiting", "failed"].includes(existing.status)) return;
  await client.socialPost.update({
    where: { id: existing.id },
    data: { status: "cancelled", clipFile: null, lastError: "Huỷ duyệt video." },
  });
  await deleteClip(existing.clipFile, mediaDir);
}

export type XStatusTone = "busy" | "queued" | "done" | "error" | "muted";

/** What the admin sees for a post's status. */
export function xStatusLabel(status: SocialPostStatus): { label: string; tone: XStatusTone } {
  switch (status) {
    case "preparing":
      return { label: "Đang xử lý clip", tone: "busy" };
    case "pushing":
      return { label: "Đang gửi Buffer", tone: "busy" };
    case "waiting":
      return { label: "Trong hàng đợi (chờ video lên web)", tone: "queued" };
    case "queued":
      return { label: "Trong hàng đợi", tone: "queued" };
    case "pushed":
      return { label: "Trong hàng đợi Buffer", tone: "queued" };
    case "sent":
      return { label: "Đã đăng", tone: "done" };
    case "failed":
      return { label: "Lỗi", tone: "error" };
    case "cancelled":
      return { label: "Không đăng", tone: "muted" };
  }
}
