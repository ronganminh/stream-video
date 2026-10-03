import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const DEFAULT_MEDIA_DIR = "public/media";

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export async function storeThumbnail(options: {
  url: string | null;
  videoId: string;
  fetchImpl?: typeof fetch;
  mediaDir?: string;
}): Promise<string | null> {
  if (!options.url) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.url);

  if (!response.ok) {
    throw new Error(
      `Thumbnail download failed with HTTP ${response.status}`,
    );
  }

  const source = Buffer.from(await response.arrayBuffer());
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
