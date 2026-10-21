import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  video: { findMany: vi.fn(), updateMany: vi.fn() },
  category: { findMany: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("../db", () => ({ prisma }));

import { mediaFilename, resizeStoredThumbnail, runMediaResize } from "./resizeMedia";

let mediaDir: string;

async function image(width: number, height: number, format: "webp" | "jpeg" = "webp") {
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = (index * 7919) % 256;
  }
  const base = sharp(pixels, { raw: { width, height, channels: 3 } });
  return format === "webp" ? base.webp().toBuffer() : base.jpeg().toBuffer();
}

async function dimensions(filename: string) {
  const metadata = await sharp(await readFile(path.join(mediaDir, filename))).metadata();
  return [metadata.format, metadata.width, metadata.height];
}

beforeEach(async () => {
  vi.resetAllMocks();
  mediaDir = await mkdtemp(path.join(os.tmpdir(), "gv-resize-"));
});

afterEach(async () => {
  await rm(mediaDir, { recursive: true, force: true });
});

describe("mediaFilename", () => {
  it.each([
    ["/media/abc_1-2.webp", "abc_1-2.webp"],
    ["/media/abc.webp?v=0123456789ab", "abc.webp"],
    ["/media/../etc/passwd", null],
    ["/media/sub/abc.webp", null],
    ["/media/abc.jpg", null],
    ["https://cdn.invalid/media/abc.webp", null],
    ["/media/abc.webp?v=../x", null],
  ])("%s -> %s", (input, expected) => {
    expect(mediaFilename(input)).toBe(expected);
  });
});

describe("resizeStoredThumbnail", () => {
  it("crops an old portrait thumbnail to 640x360 and versions its URL", async () => {
    await writeFile(path.join(mediaDir, "video-1.webp"), await image(720, 1280));

    const result = await resizeStoredThumbnail("/media/video-1.webp", { mediaDir });

    expect(result.outcome).toBe("resized");
    expect(result.thumbnailPath).toMatch(/^\/media\/video-1\.webp\?v=[0-9a-f]{12}$/);
    expect(await dimensions("video-1.webp")).toEqual(["webp", 640, 360]);
    // The atomic write leaves no temporary file behind.
    expect(await readdir(mediaDir)).toEqual(["video-1.webp"]);
  });

  it("re-encodes non-WebP content even at the right size", async () => {
    await writeFile(path.join(mediaDir, "video-2.webp"), await image(640, 360, "jpeg"));

    const result = await resizeStoredThumbnail("/media/video-2.webp", { mediaDir });

    expect(result.outcome).toBe("resized");
    expect(await dimensions("video-2.webp")).toEqual(["webp", 640, 360]);
  });

  it("only versions the URL of a correctly sized file, without re-encoding", async () => {
    const original = await image(640, 360);
    await writeFile(path.join(mediaDir, "video-3.webp"), original);

    const result = await resizeStoredThumbnail("/media/video-3.webp", { mediaDir });

    expect(result.outcome).toBe("versioned");
    expect(result.thumbnailPath).toMatch(/\?v=[0-9a-f]{12}$/);
    expect(await readFile(path.join(mediaDir, "video-3.webp"))).toEqual(original);
  });

  it("leaves a sized and versioned thumbnail alone, so reruns are no-ops", async () => {
    await writeFile(path.join(mediaDir, "video-4.webp"), await image(720, 1280));
    const first = await resizeStoredThumbnail("/media/video-4.webp", { mediaDir });

    const second = await resizeStoredThumbnail(first.thumbnailPath, { mediaDir });

    expect(second).toEqual({ outcome: "unchanged", thumbnailPath: first.thumbnailPath });
  });

  it("does not touch files on a dry run", async () => {
    const original = await image(720, 1280);
    await writeFile(path.join(mediaDir, "video-5.webp"), original);

    const result = await resizeStoredThumbnail("/media/video-5.webp", { mediaDir, dryRun: true });

    expect(result).toEqual({ outcome: "resized", thumbnailPath: "/media/video-5.webp" });
    expect(await readFile(path.join(mediaDir, "video-5.webp"))).toEqual(original);
  });

  it("refuses paths outside the media directory", async () => {
    await expect(
      resizeStoredThumbnail("/media/../../etc/passwd", { mediaDir }),
    ).rejects.toThrow(/not a managed/);
  });
});

describe("runMediaResize", () => {
  it("resizes videos and categories, updates URLs only if unchanged, and reports errors", async () => {
    await writeFile(path.join(mediaDir, "v1.webp"), await image(720, 380));
    await writeFile(path.join(mediaDir, "c1.webp"), await image(489, 875));
    prisma.video.findMany.mockResolvedValue([
      { id: "v1", thumbnailPath: "/media/v1.webp" },
      { id: "v2", thumbnailPath: "/media/missing.webp" },
    ]);
    prisma.category.findMany.mockResolvedValue([{ id: "c1", thumbnailPath: "/media/c1.webp" }]);

    const result = await runMediaResize({ mediaDir });

    expect(result).toMatchObject({ scanned: 3, resized: 2, versioned: 0, unchanged: 0 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^video v2: /);
    expect(prisma.video.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", thumbnailPath: "/media/v1.webp" },
      data: { thumbnailPath: expect.stringMatching(/^\/media\/v1\.webp\?v=/) },
    });
    expect(prisma.category.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", thumbnailPath: "/media/c1.webp" },
      data: { thumbnailPath: expect.stringMatching(/^\/media\/c1\.webp\?v=/) },
    });
    expect(await dimensions("c1.webp")).toEqual(["webp", 640, 360]);
  });

  it("writes nothing to files or the database on a dry run", async () => {
    await writeFile(path.join(mediaDir, "v1.webp"), await image(720, 380));
    prisma.video.findMany.mockResolvedValue([{ id: "v1", thumbnailPath: "/media/v1.webp" }]);
    prisma.category.findMany.mockResolvedValue([]);

    const result = await runMediaResize({ mediaDir, dryRun: true });

    expect(result).toMatchObject({ scanned: 1, resized: 1 });
    expect(prisma.video.updateMany).not.toHaveBeenCalled();
    expect(await dimensions("v1.webp")).toEqual(["webp", 720, 380]);
  });
});
