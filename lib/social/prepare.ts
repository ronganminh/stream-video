import { randomBytes } from "node:crypto";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { getHostProvider } from "../hosts/registry";
import type { DirectVideo } from "../hosts/types";
import { clipDir, clipFileName } from "./clips";
import { socialConfig, type SocialConfig } from "./config";
import { CutError, cutArgs, downloadWhole, freeBytes, hideSecrets, probeRange, runFfmpeg } from "./cutter";
import { driveDownloadUrl } from "./drive";
import { readMp4Info } from "./mp4";
import { X_NETWORK } from "./queue";
import { loadDriveLinksByHostCode } from "../sync/migrationMetadata";

// Makes the clips for X posts approved in /admin/review ("preparing" posts),
// one at a time, in the worker. Sources, in order:
//   1. the primary host, then the other hosts, when their API gives a URL
//      ffmpeg can read (today only EarnVids: GET /file/direct_link; the
//      DoodStream and VOE APIs have no such endpoint);
//   2. the video's Google Drive original, found in the migration CSVs that
//      the GitHub Actions migration uses (mounted read-only in the worker),
//      matched by the primary host's file code. The link is only held in
//      memory: never stored, logged or shown.
// Drive files are originals without the site mark, so the mark is added.

const MAX_ATTEMPTS = 3;
const RETRY_MINUTES = [15, 60];
const DISK_RETRY_MINUTES = 30;
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;
const CLIP_LABEL = "gayvideo.fun";
// Our clips run ~1 MB per 10 s at 720p; keep generous room for the output.
const OUTPUT_BYTES_PER_SECOND = 1_000_000;

const postWithVideo = {
  video: {
    select: {
      id: true,
      slug: true,
      title: true,
      durationSeconds: true,
      isPublished: true,
      isHidden: true,
      status: true,
      mirrors: {
        where: { status: "OK" },
        select: { hostId: true, fileCode: true, host: { select: { label: true, isPrimary: true, sortOrder: true } } },
      },
    },
  },
} satisfies Prisma.SocialPostInclude;

type PostWithVideo = Prisma.SocialPostGetPayload<{ include: typeof postWithVideo }>;

export type Source = {
  /** Shown in the admin: "earnvids", "drive". */
  name: string;
  label: string;
  /** Returns the URL to read, or throws with the reason it cannot. */
  resolve(): Promise<DirectVideo>;
  /** The site mark must be added (the source has none). */
  watermark: boolean;
};

/** Hosts first (primary, then by sort order), then Drive. */
export function clipSources(
  video: PostWithVideo["video"],
  options: { ip?: string; lookup?: typeof getHostProvider; driveLink?: string | null } = {},
): { sources: Source[]; skipped: string[] } {
  const lookup = options.lookup ?? getHostProvider;
  const sources: Source[] = [];
  const skipped: string[] = [];
  const mirrors = [...video.mirrors].sort(
    (a, b) => Number(b.host.isPrimary) - Number(a.host.isPrimary) || a.host.sortOrder - b.host.sortOrder,
  );
  for (const mirror of mirrors) {
    const provider = lookup(mirror.hostId);
    if (!provider?.directVideoUrl) {
      skipped.push(`${mirror.host.label}: API không có link tải trực tiếp`);
      continue;
    }
    sources.push({
      name: mirror.hostId,
      label: mirror.host.label,
      watermark: false,
      resolve: () => provider.directVideoUrl!(mirror.fileCode, { ip: options.ip }),
    });
  }
  if (options.driveLink) {
    const link = options.driveLink;
    sources.push({
      name: "drive",
      label: "Google Drive",
      watermark: true,
      resolve: async () => ({ url: driveDownloadUrl(link), kind: "file" }),
    });
  } else {
    skipped.push("Google Drive: không thấy video này trong CSV migration (hoặc chỉ có link thư mục)");
  }
  return { sources, skipped };
}

let csvCache: { at: number; hostId: string; links: Map<string, string> } | null = null;

/** Drive link for a host file code, from the migration CSVs (cached 10 min). */
async function driveLinksFromCsv(hostId: string, fileCode: string): Promise<string | null> {
  if (!csvCache || csvCache.hostId !== hostId || Date.now() - csvCache.at > 10 * 60_000) {
    csvCache = { at: Date.now(), hostId, links: await loadDriveLinksByHostCode(hostId).catch(() => new Map()) };
  }
  return csvCache.links.get(fileCode) ?? null;
}

let publicIp: Promise<string | undefined> | undefined;

/** The VPS's public IPv4 (EarnVids binds direct links to the fetching IP). */
function serverIp(): Promise<string | undefined> {
  const configured = process.env.X_SOURCE_IP?.trim();
  if (configured) return Promise.resolve(configured);
  publicIp ??= fetch("https://api.ipify.org", { signal: AbortSignal.timeout(10_000) })
    .then((response) => (response.ok ? response.text() : undefined))
    .then((text) => (text && /^\d{1,3}(\.\d{1,3}){3}$/.test(text.trim()) ? text.trim() : undefined))
    .catch(() => undefined);
  return publicIp;
}

export type CutResult = { file: string; seconds: number; source: string };

/**
 * Tries each source until one gives a clip. Range-capable URLs and HLS are
 * read in place; anything else is downloaded whole first, if the disk has
 * room. Temporary files are always removed.
 */
export async function makeClip(
  post: Pick<PostWithVideo, "clipStart" | "clipSeconds" | "clipMode">,
  sources: Source[],
  config: SocialConfig,
  options: { mediaDir?: string; fetchImpl?: typeof fetch; run?: typeof runFfmpeg } = {},
): Promise<{ result: CutResult | null; reasons: string[] }> {
  const directory = clipDir(options.mediaDir);
  await mkdir(directory, { recursive: true });
  const run = options.run ?? runFfmpeg;
  const reasons: string[] = [];
  const start = post.clipMode === "full" ? 0 : Math.max(0, post.clipStart ?? 0);
  const seconds = Math.max(1, Math.min(post.clipSeconds ?? config.clipSeconds, config.maxVideoSeconds));

  for (const source of sources) {
    const clipId = randomBytes(16).toString("base64url");
    const file = clipFileName(clipId);
    // ".part" files are swept by sweepUnusedClips if the worker dies mid-cut.
    const partial = path.join(directory, `${file}.part`);
    const download = path.join(directory, `.source-${clipId}`);
    try {
      const direct = await source.resolve();
      let input = direct.url;
      if (direct.kind === "file") {
        const probe = await probeRange(direct.url, options.fetchImpl);
        if (!probe.ok) throw new CutError(probe.reason ?? "không đọc được");
        if (!probe.range) {
          // No Range: the whole file has to come down first.
          const free = await freeBytes(directory);
          const room = free - config.clipMinFreeBytes - seconds * OUTPUT_BYTES_PER_SECOND;
          if (probe.size !== null && probe.size > room) {
            throw new CutError(
              `không hỗ trợ tải từng phần và file ${Math.round(probe.size / 1048576)} MB lớn hơn chỗ trống (${Math.round(Math.max(0, room) / 1048576)} MB)`,
            );
          }
          await downloadWhole(direct.url, download, Math.max(0, room), options.fetchImpl);
          input = download;
        }
      }
      await run(
        cutArgs({
          input,
          start,
          seconds,
          output: partial,
          watermark: source.watermark,
          label: CLIP_LABEL,
          threads: config.clipThreads,
          preset: config.clipPreset,
        }),
        FFMPEG_TIMEOUT_MS,
      );
      const info = await readMp4Info(partial);
      if (!info || info.durationSeconds < 1) throw new CutError("clip tạo ra không phải MP4 hợp lệ");
      await rename(partial, path.join(directory, file));
      return { result: { file, seconds: Math.round(info.durationSeconds), source: source.name }, reasons };
    } catch (error) {
      reasons.push(`${source.label}: ${hideSecrets(error instanceof Error ? error.message : String(error))}`);
    } finally {
      await rm(partial, { force: true });
      await rm(download, { force: true });
    }
  }
  return { result: null, reasons };
}

export type PrepareOutcome = "idle" | "made" | "retry" | "failed" | "no-disk";

/** Makes the clip for the oldest "preparing" post that is due. */
export async function prepareNextClip(
  options: {
    now?: Date;
    client?: PrismaClient;
    config?: SocialConfig;
    mediaDir?: string;
    make?: typeof makeClip;
    free?: (directory: string) => Promise<number>;
    lookup?: typeof getHostProvider;
    driveLinks?: (hostId: string, fileCode: string) => Promise<string | null>;
  } = {},
): Promise<PrepareOutcome> {
  const now = options.now ?? new Date();
  const client = options.client ?? prisma;
  const config = options.config ?? socialConfig();
  const post = await client.socialPost.findFirst({
    where: {
      network: X_NETWORK,
      status: "preparing",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    include: postWithVideo,
    orderBy: { updatedAt: "asc" },
  });
  if (!post) return "idle";

  // Disk first: a full disk would take the database and the site down too.
  const directory = clipDir(options.mediaDir);
  await mkdir(directory, { recursive: true });
  // Only one clip is made at a time, so any source download left is stale.
  for (const name of await readdir(directory)) {
    if (name.startsWith(".source-")) await rm(path.join(directory, name), { force: true });
  }
  const free = await (options.free ?? freeBytes)(directory);
  const needed = config.clipMinFreeBytes + (post.clipSeconds ?? config.clipSeconds) * OUTPUT_BYTES_PER_SECOND;
  if (free < needed) {
    await client.socialPost.update({
      where: { id: post.id },
      data: {
        lastError: `Đĩa còn ${Math.round(free / 1048576)} MB, cần ít nhất ${Math.round(needed / 1048576)} MB; sẽ thử lại sau.`,
        nextAttemptAt: new Date(now.getTime() + DISK_RETRY_MINUTES * 60_000),
      },
    });
    return "no-disk";
  }

  const ip = await serverIp();
  const primary = post.video.mirrors.find((mirror) => mirror.host.isPrimary);
  const driveLink = primary ? await (options.driveLinks ?? driveLinksFromCsv)(primary.hostId, primary.fileCode) : null;
  const { sources, skipped } = clipSources(post.video, { ip, lookup: options.lookup, driveLink });
  const { result, reasons } = sources.length
    ? await (options.make ?? makeClip)(post, sources, config, { mediaDir: options.mediaDir })
    : { result: null, reasons: [] };

  // The admin may have cancelled or changed the post while ffmpeg ran.
  const current = await client.socialPost.findUnique({ where: { id: post.id }, select: { status: true, updatedAt: true } });
  if (!current || current.status !== "preparing" || current.updatedAt.getTime() !== post.updatedAt.getTime()) {
    if (result) await rm(path.join(directory, result.file), { force: true });
    return "idle";
  }

  if (result) {
    const ready = post.video.isPublished && !post.video.isHidden && post.video.status === "AVAILABLE";
    await client.socialPost.update({
      where: { id: post.id },
      data: {
        status: ready ? "queued" : "waiting",
        clipFile: result.file,
        clipSeconds: result.seconds,
        clipSource: result.source,
        lastError: null,
        nextAttemptAt: null,
        attempts: 0,
      },
    });
    return "made";
  }

  const attempts = post.attempts + 1;
  const giveUp = attempts >= MAX_ATTEMPTS || sources.length === 0;
  const why = [...reasons, ...skipped].join(" · ") || "không có nguồn nào";
  await client.socialPost.update({
    where: { id: post.id },
    data: {
      status: giveUp ? "failed" : "preparing",
      attempts,
      lastError: `Không tạo được clip: ${why}`.slice(0, 1000),
      nextAttemptAt: giveUp ? null : new Date(now.getTime() + RETRY_MINUTES[attempts - 1] * 60_000),
    },
  });
  return giveUp ? "failed" : "retry";
}

let running = false;

/**
 * Called every worker tick, not awaited: makes clips one after another until
 * none is due. A second call while one runs does nothing, so there is never
 * more than one ffmpeg.
 */
export async function runClipJobs(log: (message: string) => void = console.info): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let index = 0; index < 20; index += 1) {
      const started = Date.now();
      const outcome = await prepareNextClip();
      if (outcome === "idle" || outcome === "no-disk") {
        if (outcome === "no-disk") log("X clip: not enough free disk, waiting");
        break;
      }
      log(`X clip: ${outcome} in ${Math.round((Date.now() - started) / 1000)} s`);
    }
  } catch (error) {
    log(`X clip: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    running = false;
  }
}
