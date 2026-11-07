import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { absoluteUrl } from "../seo/site";
import { resolveMediaDir } from "../sync/thumbnails";
import { readMp4Info } from "./mp4";

// Short clips for X live next to the thumbnails, under MEDIA_DIR/social, so
// Caddy serves them at https://<site>/media/social/<file>: Buffer needs a
// public URL and fetches it only when the post goes out (hours or days
// later). They are deleted once the post is sent, or swept when unused.

export const CLIP_SUBDIR = "social";
const CLIP_ID = /^[A-Za-z0-9_-]{22}$/;
const CLIP_FILE = /^clip-([A-Za-z0-9_-]{22})\.mp4$/;

export class ClipError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isClipId(id: string): boolean {
  return CLIP_ID.test(id);
}

export function clipFileName(id: string): string {
  if (!isClipId(id)) throw new ClipError(422, "invalid_clip", "Invalid clip id.");
  return `clip-${id}.mp4`;
}

export function clipDir(mediaDir?: string): string {
  return path.join(resolveMediaDir(mediaDir), CLIP_SUBDIR);
}

export function clipPublicUrl(file: string): string {
  return absoluteUrl(`/media/${CLIP_SUBDIR}/${file}`);
}

/** The clip's stored file and duration, or null if there is no such clip. */
export async function findClip(
  id: string,
  mediaDir?: string,
): Promise<{ file: string; seconds: number } | null> {
  const file = clipFileName(id);
  try {
    const info = await readMp4Info(path.join(clipDir(mediaDir), file));
    return info ? { file, seconds: info.durationSeconds } : null;
  } catch {
    return null;
  }
}

export async function deleteClip(file: string | null, mediaDir?: string): Promise<void> {
  if (!file || !CLIP_FILE.test(file)) return;
  await rm(path.join(clipDir(mediaDir), file), { force: true });
}

/**
 * Streams an upload to disk (never whole in memory), stopping at `maxBytes`,
 * then accepts it only if it is an MP4 no longer than `maxSeconds` (+1 s of
 * encoder slack; 0 = no limit).
 */
export async function storeClip(
  body: ReadableStream<Uint8Array> | null,
  limits: { maxBytes: number; maxSeconds: number },
  mediaDir?: string,
): Promise<{ clipId: string; file: string; bytes: number; seconds: number }> {
  if (!body) throw new ClipError(400, "empty_body", "Send the clip as the request body.");

  const directory = clipDir(mediaDir);
  await mkdir(directory, { recursive: true });
  const clipId = randomBytes(16).toString("base64url");
  const file = clipFileName(clipId);
  const partial = path.join(directory, `${file}.part`);

  let bytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > limits.maxBytes) {
        callback(new ClipError(413, "too_large", `The clip is larger than ${Math.round(limits.maxBytes / 1048576)} MB.`));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(body as never), counter, createWriteStream(partial));
    if (bytes === 0) throw new ClipError(400, "empty_body", "The clip is empty.");

    const info = await readMp4Info(partial);
    if (!info) {
      throw new ClipError(422, "not_mp4", "The clip is not an MP4 (H.264/AAC, encoded with +faststart).");
    }
    if (limits.maxSeconds > 0 && info.durationSeconds > limits.maxSeconds + 1) {
      throw new ClipError(
        422,
        "too_long",
        `The clip is ${Math.round(info.durationSeconds)} s; X_CLIP_SECONDS allows ${limits.maxSeconds} s.`,
      );
    }
    await rename(partial, path.join(directory, file));
    return { clipId, file, bytes, seconds: info.durationSeconds };
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

/**
 * Deletes clip files nobody references that are older than `maxAgeMs`
 * (uploaded but never used in a publish call), and stale partial uploads.
 */
export async function sweepUnusedClips(
  referenced: Set<string>,
  maxAgeMs: number,
  now = Date.now(),
  mediaDir?: string,
): Promise<number> {
  const directory = clipDir(mediaDir);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const partial = name.endsWith(".part");
    if (!CLIP_FILE.test(partial ? name.slice(0, -5) : name)) continue;
    if (!partial && referenced.has(name)) continue;
    const { mtimeMs } = await stat(path.join(directory, name)).catch(() => ({ mtimeMs: now }));
    if (now - mtimeMs >= (partial ? 60 * 60 * 1000 : maxAgeMs)) {
      await rm(path.join(directory, name), { force: true });
      removed += 1;
    }
  }
  return removed;
}
