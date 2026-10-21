import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from "../thumbnailSize";

const DEFAULT_MEDIA_DIR = "public/media";

export { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH };

// Cards render thumbnails in a 16:9 box at 640x360, so store exactly that:
// larger or portrait sources (e.g. 489x875 phone shots) are cropped to 16:9
// around their most interesting region instead of being shipped full size.
const THUMBNAIL_QUALITY = 78;

export async function toThumbnailWebp(source: Buffer): Promise<Buffer> {
  return sharp(source)
    .rotate()
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .webp({ quality: THUMBNAIL_QUALITY })
    .toBuffer();
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

const MAX_DOWNLOAD_ATTEMPTS = 3;

function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function downloadThumbnail(
  url: string,
  fetchImpl: typeof fetch,
): Promise<Buffer> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url);

      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }

      // 4xx (except 408/429) won't improve on retry, so fail fast.
      if (!isRetriableStatus(response.status)) {
        throw new Error(
          `Thumbnail download failed with HTTP ${response.status}`,
        );
      }

      lastError = new Error(
        `Thumbnail download failed with HTTP ${response.status}`,
      );
    } catch (error) {
      // A thrown HTTP-4xx error above is final; anything else (network
      // errors, retriable statuses) gets another attempt.
      if (
        error instanceof Error &&
        /HTTP (4\d\d)/.test(error.message) &&
        !/HTTP (408|429)/.test(error.message)
      ) {
        throw error;
      }
      lastError = error;
    }

    if (attempt < MAX_DOWNLOAD_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Thumbnail download failed");
}

export async function storeThumbnail(options: {
  url: string | null;
  videoId: string;
  fetchImpl?: typeof fetch;
  mediaDir?: string;
}): Promise<string | null> {
  if (!options.url) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const source = await downloadThumbnail(options.url, fetchImpl);
  const output = await toThumbnailWebp(source);

  return writeThumbnail(
    output,
    `${safeName(options.videoId)}.webp`,
    options.mediaDir,
  );
}

export function resolveMediaDir(mediaDir?: string): string {
  return mediaDir ?? process.env.MEDIA_DIR ?? DEFAULT_MEDIA_DIR;
}

// Writes a finished thumbnail and returns its public, content-versioned URL.
export async function writeThumbnail(
  output: Buffer,
  filename: string,
  mediaDir?: string,
): Promise<string> {
  const directory = resolveMediaDir(mediaDir);
  await mkdir(directory, { recursive: true });

  // Write then rename so Caddy never serves a half-written file.
  const target = path.join(directory, filename);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, output);
  await rename(temporary, target);

  // The file name is fixed per video and Caddy serves /media as immutable, so
  // version the URL by content: a new thumbnail gets a new URL.
  const version = createHash("sha256").update(output).digest("hex").slice(0, 12);
  return `/media/${filename}?v=${version}`;
}
