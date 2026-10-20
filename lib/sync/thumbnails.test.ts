import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import {
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  storeThumbnail,
  toThumbnailWebp,
} from "./thumbnails";

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

    expect(publicPath).toMatch(/^\/media\/video-unsafe-id\.webp\?v=[0-9a-f]{12}$/);

    const output = await readFile(
      path.join(directory, "video-unsafe-id.webp"),
    );
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe("webp");
    expect([metadata.width, metadata.height]).toEqual([640, 360]);
  });
});

describe("thumbnail URL versioning", () => {
  it("changes the URL when the stored image changes", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "gv-media-"));
    cleanup.push(directory);

    const store = (fill: string) =>
      storeThumbnail({
        url: "https://img.invalid/thumb.svg",
        videoId: "video-1",
        mediaDir: directory,
        fetchImpl: async () =>
          new Response(
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="${fill}"/></svg>`,
            { status: 200 },
          ),
      });

    const first = await store("black");
    const same = await store("black");
    const changed = await store("white");

    expect(same).toBe(first);
    expect(changed).not.toBe(first);
    expect(changed?.split("?")[0]).toBe(first?.split("?")[0]);
  });
});

describe("thumbnail conversion", () => {
  // Noisy pixels compress like a real photo, unlike a flat test fill.
  function noisyJpeg(width: number, height: number) {
    const pixels = Buffer.alloc(width * height * 3);
    for (let index = 0; index < pixels.length; index += 1) {
      pixels[index] = (index * 7919 + (index >> 5) * 104729) % 256;
    }
    return sharp(pixels, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  it.each([
    ["portrait phone shot", 489, 875],
    ["oversized landscape", 1920, 1080],
    ["host-sized 720x380", 720, 380],
    ["small source", 320, 180],
  ])("crops a %s to a 640x360 WebP", async (_label, width, height) => {
    const output = await toThumbnailWebp(await noisyJpeg(width, height));
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(THUMBNAIL_WIDTH);
    expect(metadata.height).toBe(THUMBNAIL_HEIGHT);
  });

  it("keeps a portrait source well under the old full-size output", async () => {
    const source = await noisyJpeg(489, 875);
    const before = await sharp(source).rotate().webp({ quality: 82 }).toBuffer();
    const after = await toThumbnailWebp(source);

    expect(after.length).toBeLessThan(before.length / 2);
  });

  it("honours EXIF orientation before cropping", async () => {
    // Stored as 360x640 but tagged "rotate 90°", i.e. displayed landscape.
    const pixels = Buffer.alloc(360 * 640 * 3, 128);
    const source = await sharp(pixels, {
      raw: { width: 360, height: 640, channels: 3 },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const metadata = await sharp(await toThumbnailWebp(source)).metadata();
    expect([metadata.width, metadata.height]).toEqual([640, 360]);
    expect(metadata.orientation).toBeUndefined();
  });
});
