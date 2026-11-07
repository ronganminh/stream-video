import type { PrismaClient, SocialPost } from "@prisma/client";

import { prisma } from "../db";
import { absoluteUrl } from "../seo/site";
import { bufferClient, BufferError, type BufferApi, type BufferChannel, type BufferPost } from "./buffer";
import { deleteClip, findClip, sweepUnusedClips } from "./clips";
import { socialConfig, type SocialConfig } from "./config";
import { composeXText } from "./xText";

// The X queue. Posts are created by the publish API (enqueueXPost) and moved
// along by the worker (runSocialSync), which is the only code that talks to
// Buffer. Rules:
// - one post per video (unique videoId+network): never announced twice;
// - a post waits until its video is public, then until Buffer's queue has
//   room (Free keeps 10 per channel);
// - one Buffer read per cycle (its Free plan allows ~1000 requests a month);
// - nothing here can fail a web publish: callers turn errors into warnings.

export const X_NETWORK = "x";
const CHANNEL_SETTING = "social.x.bufferChannel";
const LAST_SYNC_SETTING = "social.x.lastSyncAt";
const MAX_ATTEMPTS = 5;
const PUSHING_TIMEOUT_MS = 15 * 60 * 1000;
const UNUSED_CLIP_MS = 24 * 60 * 60 * 1000;
const DEAD_CLIP_MS = 7 * 24 * 60 * 60 * 1000;

type Db = PrismaClient;

function watchUrl(slug: string): string {
  return absoluteUrl(`/watch/${slug}`);
}

/**
 * Queue (or update) the X post for a video. The clip must already be
 * uploaded. A post Buffer already has is never re-sent; then the new clip is
 * dropped and a warning returned.
 */
export async function enqueueXPost(
  input: { videoId: string; clipId: string; caption: string },
  client: Db = prisma,
  mediaDir?: string,
): Promise<{ status: SocialPost["status"]; warning?: string }> {
  const clip = await findClip(input.clipId, mediaDir);
  if (!clip) throw new Error(`Clip ${input.clipId} was not found; upload it first.`);

  const video = await client.video.findUniqueOrThrow({
    where: { id: input.videoId },
    select: { isPublished: true, isHidden: true, status: true },
  });
  const ready = video.isPublished && !video.isHidden && video.status === "AVAILABLE";
  const status = ready ? "queued" : "waiting";
  const existing = await client.socialPost.findUnique({
    where: { videoId_network: { videoId: input.videoId, network: X_NETWORK } },
  });

  if (existing && ["pushing", "pushed", "sent"].includes(existing.status)) {
    if (existing.clipFile !== clip.file) await deleteClip(clip.file, mediaDir);
    return {
      status: existing.status,
      warning: `X post already ${existing.status === "sent" ? "published" : "in Buffer"}; not posted again.`,
    };
  }

  const data = {
    status,
    caption: input.caption,
    clipFile: clip.file,
    clipSeconds: Math.round(clip.seconds),
    attempts: 0,
    lastError: null,
    nextAttemptAt: null,
  } as const;
  if (existing) {
    await client.socialPost.update({ where: { id: existing.id }, data });
    if (existing.clipFile && existing.clipFile !== clip.file) await deleteClip(existing.clipFile, mediaDir);
  } else {
    await client.socialPost.create({ data: { ...data, videoId: input.videoId, network: X_NETWORK } });
  }
  return { status };
}

export type SyncSummary = {
  skipped?: "disabled" | "idle" | "rate-limit";
  promoted: number;
  pushed: number;
  sent: number;
  failed: number;
  room: number | null;
  errors: string[];
};

async function bufferChannel(config: SocialConfig, api: BufferApi, client: Db): Promise<BufferChannel> {
  if (config.channelId && config.organizationId) {
    return { channelId: config.channelId, organizationId: config.organizationId };
  }
  const saved = await client.setting.findUnique({ where: { key: CHANNEL_SETTING } });
  const value = saved?.value as Partial<BufferChannel & { handle: string }> | undefined;
  if (value?.channelId && value.organizationId && value.handle === config.xHandle) {
    return { channelId: value.channelId, organizationId: value.organizationId };
  }
  const found = await api.findXChannel(config.xHandle);
  await client.setting.upsert({
    where: { key: CHANNEL_SETTING },
    create: { key: CHANNEL_SETTING, value: { ...found, handle: config.xHandle } },
    update: { value: { ...found, handle: config.xHandle } },
  });
  return found;
}

/** The Buffer post a "pushing" row became, if its createPost call did land. */
function matchPushed(row: SocialPost & { video: { slug: string } }, posts: BufferPost[]) {
  const url = watchUrl(row.video.slug);
  const head = row.caption.trim().slice(0, 40);
  return posts.find((post) => post.text.includes(url) || (head.length >= 10 && post.text.startsWith(head)));
}

function backoff(attempts: number, now: Date, baseMinutes: number): Date {
  const minutes = Math.min(baseMinutes * 2 ** Math.max(0, attempts - 1), 24 * 60);
  return new Date(now.getTime() + minutes * 60_000);
}

/**
 * One worker cycle. At most one Buffer read plus one createPost per free
 * queue slot. Returns what changed; logs nothing secret.
 */
export async function runSocialSync(
  options: { now?: Date; config?: SocialConfig; api?: BufferApi; client?: Db; mediaDir?: string } = {},
): Promise<SyncSummary> {
  const now = options.now ?? new Date();
  const config = options.config ?? socialConfig();
  const client = options.client ?? prisma;
  const summary: SyncSummary = { promoted: 0, pushed: 0, sent: 0, failed: 0, room: null, errors: [] };

  // Housekeeping that needs no Buffer call.
  const promoted = await client.socialPost.updateMany({
    where: {
      network: X_NETWORK,
      status: "waiting",
      video: { isPublished: true, isHidden: false, status: "AVAILABLE" },
    },
    data: { status: "queued" },
  });
  summary.promoted = promoted.count;
  await sweepClips(client, now, options.mediaDir);

  if (!config.enabled) return { ...summary, skipped: "disabled" };

  const active = await client.socialPost.findMany({
    where: {
      network: X_NETWORK,
      OR: [
        { status: { in: ["pushing", "pushed"] } },
        { status: "queued", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
      ],
    },
    include: { video: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!active.length) return { ...summary, skipped: "idle" };

  const api = options.api ?? bufferClient(config.apiKey);
  const channel = await bufferChannel(config, api, client);

  // One read: every post of the channel since our oldest one in Buffer. It
  // shows which of ours went out, and how full the queue is (scheduled posts
  // are due in the future, so they are always within the window).
  const inBuffer = active.filter((row) => row.status !== "queued");
  const oldest = inBuffer.reduce(
    (min, row) => Math.min(min, (row.pushedAt ?? now).getTime()),
    now.getTime(),
  );
  const since = new Date(oldest - 24 * 60 * 60 * 1000);
  const { posts, remaining30d } = await api.channelPosts(channel, since);
  const byId = new Map(posts.map((post) => [post.id, post]));
  const listComplete = posts.length < 100;

  for (const row of inBuffer) {
    if (row.status === "pushing") {
      const landed = matchPushed(row, posts);
      if (landed) {
        await client.socialPost.update({
          where: { id: row.id },
          data: { status: "pushed", bufferPostId: landed.id, lastError: null },
        });
        row.status = "pushed";
        row.bufferPostId = landed.id;
      } else if (now.getTime() - (row.pushedAt ?? now).getTime() > PUSHING_TIMEOUT_MS && listComplete) {
        // The call never reached Buffer: safe to try again.
        await client.socialPost.update({
          where: { id: row.id },
          data: { status: "queued", pushedAt: null },
        });
        row.status = "queued";
        continue;
      } else {
        continue;
      }
    }

    const post = row.bufferPostId ? byId.get(row.bufferPostId) : undefined;
    if (post?.status === "sent") {
      await client.socialPost.update({
        where: { id: row.id },
        data: {
          status: "sent",
          sentAt: post.sentAt ? new Date(post.sentAt) : now,
          externalLink: post.externalLink,
          clipFile: null,
          lastError: null,
        },
      });
      await deleteClip(row.clipFile, options.mediaDir);
      summary.sent += 1;
    } else if (post?.status === "error") {
      await client.socialPost.update({
        where: { id: row.id },
        data: { status: "failed", lastError: `Buffer: ${post.error?.message ?? "publishing failed"}`.slice(0, 500) },
      });
      summary.failed += 1;
    } else if (!post && listComplete) {
      await client.socialPost.update({
        where: { id: row.id },
        data: { status: "cancelled", lastError: "No longer in Buffer (deleted there?)", clipFile: null },
      });
      await deleteClip(row.clipFile, options.mediaDir);
    }
  }

  const scheduled = posts.filter((post) => post.status === "scheduled" || post.status === "sending").length;
  const room = Math.max(0, config.queueLimit - scheduled);
  summary.room = room;
  if (remaining30d !== null && remaining30d <= config.rateReserve) {
    summary.errors.push(`Buffer 30-day budget nearly used (${remaining30d} left); not pushing.`);
    return { ...summary, skipped: "rate-limit" };
  }

  const ready = active.filter((row) => row.status === "queued").slice(0, room);
  for (const row of ready) {
    const claimed = await client.socialPost.updateMany({
      where: { id: row.id, status: "queued" },
      data: { status: "pushing", pushedAt: now },
    });
    if (!claimed.count) continue;

    if (!row.clipFile) {
      await client.socialPost.update({
        where: { id: row.id },
        data: { status: "failed", lastError: "The clip is missing; send the video again with a clip." },
      });
      summary.failed += 1;
      continue;
    }

    const text = composeXText(row.caption, watchUrl(row.video.slug));
    try {
      const result = await api.createVideoPost(
        channel.channelId,
        text,
        absoluteUrl(`/media/social/${row.clipFile}`),
      );
      if (result.ok) {
        await client.socialPost.update({
          where: { id: row.id },
          data: { status: "pushed", bufferPostId: result.postId, lastError: null },
        });
        summary.pushed += 1;
        continue;
      }
      // Buffer refused it. A full queue is not the post's fault.
      const full = /limit|queue.*full|full.*queue/i.test(result.message);
      const attempts = full ? row.attempts : row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await client.socialPost.update({
        where: { id: row.id },
        data: {
          status: giveUp ? "failed" : "queued",
          pushedAt: null,
          attempts,
          lastError: `Buffer: ${result.message}`,
          nextAttemptAt: giveUp ? null : backoff(Math.max(1, attempts), now, config.syncMinutes),
        },
      });
      if (giveUp) summary.failed += 1;
      summary.errors.push(`${row.video.slug}: ${result.message}`);
      if (full) break;
    } catch (error) {
      const bufferError = error instanceof BufferError ? error : null;
      if (bufferError?.sent) {
        // Outcome unknown: stay "pushing"; the next read finds it or retries.
        summary.errors.push(`${row.video.slug}: ${bufferError.message} (will check next cycle)`);
        break;
      }
      await client.socialPost.update({
        where: { id: row.id },
        data: { status: "queued", pushedAt: null, lastError: String(bufferError?.message ?? error).slice(0, 500) },
      });
      throw error;
    }
  }
  return summary;
}

/** Deletes clips nothing needs any more. */
async function sweepClips(client: Db, now: Date, mediaDir?: string) {
  const dead = await client.socialPost.findMany({
    where: {
      clipFile: { not: null },
      status: { in: ["failed", "cancelled"] },
      updatedAt: { lt: new Date(now.getTime() - DEAD_CLIP_MS) },
    },
    select: { id: true, clipFile: true },
  });
  for (const row of dead) {
    await deleteClip(row.clipFile, mediaDir);
    await client.socialPost.update({ where: { id: row.id }, data: { clipFile: null } });
  }
  const kept = await client.socialPost.findMany({
    where: { clipFile: { not: null } },
    select: { clipFile: true },
  });
  await sweepUnusedClips(
    new Set(kept.map((row) => row.clipFile!)),
    UNUSED_CLIP_MS,
    now.getTime(),
    mediaDir,
  );
}

/** Called by the worker every minute; runs a cycle every BUFFER_SYNC_MINUTES. */
export async function runSocialSyncIfDue(now = new Date(), client: Db = prisma): Promise<SyncSummary | null> {
  const config = socialConfig();
  const last = await client.setting.findUnique({ where: { key: LAST_SYNC_SETTING } });
  const lastAt = typeof last?.value === "string" ? Date.parse(last.value) : NaN;
  if (Number.isFinite(lastAt) && now.getTime() - lastAt < config.syncMinutes * 60_000) return null;

  await client.setting.upsert({
    where: { key: LAST_SYNC_SETTING },
    create: { key: LAST_SYNC_SETTING, value: now.toISOString() },
    update: { value: now.toISOString() },
  });
  return runSocialSync({ now, config, client });
}
