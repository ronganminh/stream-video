import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { storeThumbnail } from "./thumbnails";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("thumbnail storage", () => {
  it("returns null when the host has no thumbnail", async () => {
    await expect(
      storeThumbnail({ url: null, videoId: "video-1" }),
    ).resolves.toBeNull();
  });

  it("stores downloaded artwork as WebP under MEDIA_DIR", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "gv-media-"));
    cleanup.push(directory);

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="black"/></svg>';
    const fetchImpl: typeof fetch = async () =>
      new Response(svg, {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      });

    const publicPath = await storeThumbnail({
      url: "https://img.invalid/thumb.svg",
      videoId: "video/unsafe id",
      fetchImpl,
      mediaDir: directory,
    });

    expect(publicPath).toBe("/media/video-unsafe-id.webp");

    const output = await readFile(
      path.join(directory, "video-unsafe-id.webp"),
    );
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe("webp");
  });
});
