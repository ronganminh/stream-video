import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const DEFAULT_MEDIA_DIR = "public/media";

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
  const output = await sharp(source)
    .rotate()
    .webp({ quality: 82 })
    .toBuffer();

  const mediaDir =
    options.mediaDir ?? process.env.MEDIA_DIR ?? DEFAULT_MEDIA_DIR;
  await mkdir(mediaDir, { recursive: true });

  const filename = `${safeName(options.videoId)}.webp`;
  await writeFile(path.join(mediaDir, filename), output);

  return `/media/${filename}`;
}
