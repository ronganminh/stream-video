import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { deleteClip, findClip } from "./clips";
import { X_NETWORK } from "./queue";

// The server side of the GitHub Actions clip workflow
// (.github/workflows/x-clips.yml, scripts/x-clips/make_clips.py):
// - GET  /api/v1/social/pending           posts waiting for a clip ("preparing");
// - POST /api/v1/social/<id>/clip          attach a clip uploaded to /api/v1/clips;
// - POST /api/v1/social/<id>/failure       report why no clip could be made.
// The workflow finds the source (EarnVids, then the Google Drive original in
// the private migration CSV); the server never sees or stores that link.

const MAX_ATTEMPTS = 3;
const RETRY_MINUTES = [15, 60];

type Db = Pick<PrismaClient, "socialPost">;

export type PendingClip = {
  postId: string;
  videoId: string;
  slug: string;
  title: string;
  mode: "clip" | "full";
  start: number;
  seconds: number;
  durationSeconds: number | null;
  attempts: number;
  /** Primary host first; the workflow matches them against the migration log. */
  mirrors: { host: string; fileCode: string; primary: boolean }[];
};

export class ClipJobError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Posts due for a clip, oldest first. */
export async function listPendingClips(now = new Date(), client: Db = prisma): Promise<PendingClip[]> {
  const posts = await client.socialPost.findMany({
    where: {
      network: X_NETWORK,
      status: "preparing",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    include: {
      video: {
        select: {
          id: true,
          slug: true,
          title: true,
          durationSeconds: true,
          mirrors: {
            where: { status: "OK" },
            select: { hostId: true, fileCode: true, host: { select: { isPrimary: true, sortOrder: true } } },
          },
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  return posts.map((post) => ({
    postId: post.id,
    videoId: post.videoId,
    slug: post.video.slug,
    title: post.video.title,
    mode: post.clipMode === "full" ? "full" : "clip",
    start: Math.max(0, post.clipStart ?? 0),
    seconds: Math.max(1, post.clipSeconds ?? 120),
    durationSeconds: post.video.durationSeconds,
    attempts: post.attempts,
    mirrors: [...post.video.mirrors]
      .sort((a, b) => Number(b.host.isPrimary) - Number(a.host.isPrimary) || a.host.sortOrder - b.host.sortOrder)
      .map((mirror) => ({ host: mirror.hostId, fileCode: mirror.fileCode, primary: mirror.host.isPrimary })),
  }));
}

/** Removes URLs and anything token-like from a message the workflow sends. */
export function cleanReason(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\b(?:gv|ghp|github_pat|sk)_[A-Za-z0-9_-]{8,}/g, "[secret]")
    .replace(/\b[A-Za-z0-9_-]{33,}\b/g, "[id]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

/** Attaches an uploaded clip; the post leaves "preparing". */
export async function attachClip(
  input: { postId: string; clipId: string; source: string },
  client: Db = prisma,
  mediaDir?: string,
): Promise<{ status: "queued" | "waiting" }> {
  const clip = await findClip(input.clipId, mediaDir);
  if (!clip) throw new ClipJobError(422, "unknown_clip", "Upload the clip to /api/v1/clips first.");
  const post = await client.socialPost.findUnique({
    where: { id: input.postId },
    include: { video: { select: { isPublished: true, isHidden: true, status: true } } },
  });
  if (!post) {
    await deleteClip(clip.file, mediaDir);
    throw new ClipJobError(404, "not_found", "No such X post.");
  }
  if (post.status !== "preparing") {
    // Cancelled or changed while the workflow ran: the clip is not needed.
    await deleteClip(clip.file, mediaDir);
    throw new ClipJobError(409, "not_preparing", `The post is ${post.status}; clip dropped.`);
  }
  const ready = post.video.isPublished && !post.video.isHidden && post.video.status === "AVAILABLE";
  const status = ready ? "queued" : "waiting";
  await client.socialPost.update({
    where: { id: post.id },
    data: {
      status,
      clipFile: clip.file,
      clipSeconds: Math.round(clip.seconds),
      clipSource: input.source.replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || null,
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
    },
  });
  return { status };
}

/** Records a failed attempt: retried later, failed after three tries (or `final`). */
export async function reportClipFailure(
  input: { postId: string; reason: string; final?: boolean },
  now = new Date(),
  client: Db = prisma,
): Promise<{ status: "preparing" | "failed"; nextAttemptAt: Date | null }> {
  const post = await client.socialPost.findUnique({ where: { id: input.postId } });
  if (!post) throw new ClipJobError(404, "not_found", "No such X post.");
  if (post.status !== "preparing") throw new ClipJobError(409, "not_preparing", `The post is ${post.status}.`);
  const attempts = post.attempts + 1;
  const giveUp = input.final === true || attempts >= MAX_ATTEMPTS;
  const nextAttemptAt = giveUp ? null : new Date(now.getTime() + RETRY_MINUTES[attempts - 1] * 60_000);
  await client.socialPost.update({
    where: { id: post.id },
    data: {
      status: giveUp ? "failed" : "preparing",
      attempts,
      lastError: `Không tạo được clip: ${cleanReason(input.reason) || "không rõ lý do"}`,
      nextAttemptAt,
    },
  });
  return { status: giveUp ? "failed" : "preparing", nextAttemptAt };
}
