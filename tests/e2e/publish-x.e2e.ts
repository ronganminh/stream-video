import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial", retries: 0 });

// The X side of the publish API: clips are uploaded, the post is queued in
// the database and waits for the video to be public. Buffer is not
// configured on the E2E server, so nothing leaves the machine.

const prisma = new PrismaClient();
const PREFIX = "e2e-x-";
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const token = "gv_" + randomBytes(32).toString("base64url");
const auth = { authorization: `Bearer ${token}` };
const dir = mkdtempSync(path.join(tmpdir(), "gv-x-e2e-"));

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
}

async function cleanUp() {
  const videos = await prisma.video.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true } });
  const ids = videos.map((video) => video.id);
  await prisma.hostFile.deleteMany({ where: { fileCode: { startsWith: PREFIX } } });
  await prisma.socialPost.deleteMany({ where: { videoId: { in: ids } } });
  await prisma.mirror.deleteMany({ where: { videoId: { in: ids } } });
  await prisma.videoTag.deleteMany({ where: { videoId: { in: ids } } });
  await prisma.adminAction.deleteMany({ where: { OR: ids.map((id) => ({ target: { startsWith: id } })) } });
  await prisma.video.deleteMany({ where: { id: { in: ids } } });
  await prisma.apiToken.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

test.beforeAll(async () => {
  test.skip(!hasFfmpeg, "needs ffmpeg");
  await cleanUp();
  const admin = await prisma.adminUser.findFirstOrThrow({ where: { email: "admin@gayvideo.test" } });
  await prisma.apiToken.create({
    data: {
      name: `${PREFIX}colab`,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      adminId: admin.id,
    },
  });
  await prisma.hostFile.createMany({
    data: ["a", "b"].map((code) => ({
      hostId: "dood",
      fileCode: `${PREFIX}${code}`,
      rawTitle: `${code}.mp4`,
      normalizedName: code,
    })),
  });
  // A 3 s clip, and a source video for the Python client to cut.
  ffmpeg([
    "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=3",
    "-f", "lavfi", "-i", "sine=duration=3",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
    "-movflags", "+faststart", path.join(dir, "clip.mp4"),
  ]);
  ffmpeg([
    "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=10",
    "-f", "lavfi", "-i", "sine=duration=10",
    "-c:v", "libx264", "-c:a", "aac", "-shortest", path.join(dir, "source.mp4"),
  ]);
});

test.afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

test("meta tells clients how long the X clip may be", async ({ request }) => {
  const meta = await (await request.get("/api/v1/meta", { headers: auth })).json();
  expect(meta.x).toEqual({
    enabled: false,
    handle: "Gayvideofun",
    clipSeconds: 120,
    clipMaxBytes: 512 * 1024 * 1024,
  });
});

test("clip upload accepts an MP4 and refuses anything else", async ({ request }) => {
  const ok = await request.post("/api/v1/clips", {
    headers: { ...auth, "content-type": "video/mp4" },
    data: readFileSync(path.join(dir, "clip.mp4")),
  });
  expect(ok.status()).toBe(201);
  const clip = await ok.json();
  expect(clip.clipId).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(clip.seconds).toBeGreaterThan(2.9);

  const html = await request.post("/api/v1/clips", {
    headers: { ...auth, "content-type": "video/mp4" },
    data: Buffer.from("<html>not a video</html>"),
  });
  expect(html.status()).toBe(422);
  expect((await html.json()).error.code).toBe("not_mp4");

  const wrongType = await request.post("/api/v1/clips", {
    headers: { ...auth, "content-type": "image/png" },
    data: Buffer.from("x"),
  });
  expect(wrongType.status()).toBe(415);

  const anonymous = await request.post("/api/v1/clips", {
    headers: { "content-type": "video/mp4" },
    data: readFileSync(path.join(dir, "clip.mp4")),
  });
  expect(anonymous.status()).toBe(401);
});

test("a clip longer than X_CLIP_SECONDS is refused", async ({ request }) => {
  ffmpeg([
    "-f", "lavfi", "-i", "color=size=64x64:rate=5:duration=125",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", path.join(dir, "long.mp4"),
  ]);
  const response = await request.post("/api/v1/clips", {
    headers: { ...auth, "content-type": "video/mp4" },
    data: readFileSync(path.join(dir, "long.mp4")),
  });
  expect(response.status()).toBe(422);
  expect((await response.json()).error.code).toBe("too_long");
});

test("publishing with x queues one X post, waiting while the video is a draft", async ({ request }) => {
  const upload = await request.post("/api/v1/clips", {
    headers: { ...auth, "content-type": "video/mp4" },
    data: readFileSync(path.join(dir, "clip.mp4")),
  });
  const { clipId } = await upload.json();

  // A bad clip id is refused before anything is written.
  const bad = await request.post("/api/v1/videos", {
    headers: auth,
    data: {
      title: "E2E X Bad",
      mirrors: [{ host: "dood", fileCode: `${PREFIX}a` }],
      x: { caption: "New video", clipId: "a".repeat(22) },
    },
  });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error.code).toBe("unknown_clip");
  expect(await prisma.video.count({ where: { title: "E2E X Bad" } })).toBe(0);

  const response = await request.post("/api/v1/videos", {
    headers: auth,
    data: {
      title: "E2E X Trần Đức",
      mirrors: [{ host: "dood", fileCode: `${PREFIX}a` }],
      x: { caption: "New video: Tran Duc", clipId },
    },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.x).toEqual({ status: "waiting" });
  expect(body.warnings.join(" ")).toContain("BUFFER_API_KEY");

  const post = await prisma.socialPost.findUniqueOrThrow({
    where: { videoId_network: { videoId: body.video.id, network: "x" } },
  });
  expect(post).toMatchObject({ status: "waiting", caption: "New video: Tran Duc", clipFile: `clip-${clipId}.mp4` });

  // Publishing the same video again keeps one X post.
  const again = await request.post("/api/v1/videos", {
    headers: auth,
    data: { title: "E2E X Trần Đức", mirrors: [{ host: "dood", fileCode: `${PREFIX}a` }], publish: true },
  });
  expect(again.status()).toBe(200);
  expect(await prisma.socialPost.count({ where: { videoId: body.video.id } })).toBe(1);

  const fetched = await (await request.get(`/api/v1/videos/${body.video.id}`, { headers: auth })).json();
  expect(fetched.video.social).toEqual([
    expect.objectContaining({ network: "x", status: "waiting" }),
  ]);
});

test("the Python client cuts, uploads and queues the X clip", async () => {
  const out = execFileSync(
    "python3",
    [
      "scripts/publish-client/gayvideo_publish.py",
      "--title", "E2E X Python",
      "--mirror", `dood:${PREFIX}b`,
      "--publish",
      "--x-caption", "New video from Colab",
      "--x-video", path.join(dir, "source.mp4"),
      "--x-start", "2",
      "--x-seconds", "4",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, GAYVIDEO_API_TOKEN: token, GAYVIDEO_API_URL: "http://localhost:3000" },
    },
  );
  expect(out).toContain("Created: http://localhost:3000/watch/e2e-x-python");
  expect(out).toContain("X: queued");

  const post = await prisma.socialPost.findFirstOrThrow({
    where: { video: { slug: "e2e-x-python" } },
  });
  expect(post).toMatchObject({ status: "queued", caption: "New video from Colab" });
  expect(post.clipSeconds).toBe(4);
});
