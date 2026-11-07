import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { BufferError, type BufferApi, type BufferPost } from "./buffer";
import { clipDir } from "./clips";
import type { SocialConfig } from "./config";
import { enqueueXPost, runSocialSync } from "./queue";

/** The smallest file readMp4Info accepts: ftyp + moov/mvhd with a duration. */
export function tinyMp4(seconds: number): Buffer {
  const box = (type: string, payload: Buffer) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + payload.length, 0);
    header.write(type, 4, "latin1");
    return Buffer.concat([header, payload]);
  };
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12); // timescale
  mvhd.writeUInt32BE(Math.round(seconds * 1000), 16); // duration
  return Buffer.concat([
    box("ftyp", Buffer.from("isom\0\0\0\0isomiso2avc1mp41", "latin1")),
    box("moov", box("mvhd", mvhd)),
  ]);
}

const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "e2e-social-";

describe.skipIf(!databaseUrl)("X queue (Buffer)", () => {
  const prisma = new PrismaClient();
  const mediaDir = mkdtempSync(path.join(tmpdir(), "gv-social-"));
  const config: SocialConfig = {
    enabled: true,
    apiKey: "buf_test",
    channelId: "chan1",
    organizationId: "org1",
    xHandle: "Gayvideofun",
    queueLimit: 10,
    syncMinutes: 120,
    rateReserve: 50,
    clipSeconds: 120,
    clipMaxBytes: 512 * 1024 * 1024,
  };
  let clipCounter = 0;

  function makeClip(): string {
    clipCounter += 1;
    const id = `${"c".repeat(18)}${String(clipCounter).padStart(4, "0")}`;
    writeFileSync(path.join(clipDir(mediaDir), `clip-${id}.mp4`), tinyMp4(30));
    return id;
  }
  const clipExists = (file: string | null) => Boolean(file) && existsSync(path.join(clipDir(mediaDir), file!));

  /** A fake Buffer: a list of channel posts and a record of calls. */
  function fakeBuffer(options: { posts?: BufferPost[]; remaining?: number | null; create?: BufferApi["createVideoPost"] } = {}) {
    const calls = { list: 0, create: [] as { text: string; url: string }[] };
    let next = 0;
    const api: BufferApi = {
      findXChannel: async () => ({ channelId: "chan1", organizationId: "org1" }),
      channelPosts: async () => {
        calls.list += 1;
        return { posts: options.posts ?? [], remaining30d: options.remaining ?? 900 };
      },
      createVideoPost:
        options.create ??
        (async (_channel, text, url) => {
          calls.create.push({ text, url });
          next += 1;
          return { ok: true, postId: `bp-${next}` };
        }),
    };
    return { api, calls };
  }
  const post = (id: string, status: BufferPost["status"], extra: Partial<BufferPost> = {}): BufferPost => ({
    id,
    status,
    text: "",
    dueAt: null,
    sentAt: null,
    externalLink: null,
    error: null,
    ...extra,
  });

  async function video(n: number, published: boolean) {
    const id = `${PREFIX}${n}`;
    await prisma.video.create({
      data: { id, slug: id, title: `Social ${n}`, status: "AVAILABLE", isPublished: published, isHidden: false },
    });
    return id;
  }
  const row = (videoId: string) =>
    prisma.socialPost.findUniqueOrThrow({ where: { videoId_network: { videoId, network: "x" } } });
  const sync = (api: BufferApi, extra: Partial<SocialConfig> = {}, now = new Date()) =>
    runSocialSync({ now, config: { ...config, ...extra }, api, client: prisma, mediaDir });

  async function cleanUp() {
    await prisma.socialPost.deleteMany({ where: { videoId: { startsWith: PREFIX } } });
    await prisma.video.deleteMany({ where: { id: { startsWith: PREFIX } } });
  }

  beforeAll(async () => {
    rmSync(clipDir(mediaDir), { recursive: true, force: true });
    const { mkdirSync } = await import("node:fs");
    mkdirSync(clipDir(mediaDir), { recursive: true });
  });
  beforeEach(cleanUp);
  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
    rmSync(mediaDir, { recursive: true, force: true });
  });

  it("waits while the video is a draft, then pushes once it is public", async () => {
    const videoId = await video(1, false);
    const queued = await enqueueXPost({ videoId, clipId: makeClip(), caption: "New video: Social 1" }, prisma, mediaDir);
    expect(queued.status).toBe("waiting");

    const { api, calls } = fakeBuffer();
    expect((await sync(api)).skipped).toBe("idle");
    expect(calls.list).toBe(0); // nothing to do: no Buffer request at all

    await prisma.video.update({ where: { id: videoId }, data: { isPublished: true } });
    const summary = await sync(api);
    expect(summary).toMatchObject({ promoted: 1, pushed: 1 });
    expect(calls.list).toBe(1);
    expect(calls.create[0].text).toBe(`New video: Social 1\n\nhttps://gayvideo.fun/watch/${videoId}`);
    expect(calls.create[0].url).toMatch(/^https:\/\/gayvideo\.fun\/media\/social\/clip-[A-Za-z0-9_-]{22}\.mp4$/);
    expect(await row(videoId)).toMatchObject({ status: "pushed", bufferPostId: "bp-1" });
  });

  it("pushes only while Buffer's queue has room", async () => {
    const ids = [await video(2, true), await video(3, true), await video(4, true)];
    for (const videoId of ids) {
      await enqueueXPost({ videoId, clipId: makeClip(), caption: "x" }, prisma, mediaDir);
    }
    // 9 of 10 slots already taken by other scheduled posts.
    const others = Array.from({ length: 9 }, (_, i) => post(`other-${i}`, "scheduled"));
    const { api, calls } = fakeBuffer({ posts: others });
    const summary = await sync(api);
    expect(summary).toMatchObject({ room: 1, pushed: 1 });
    expect(calls.create).toHaveLength(1);
    expect((await row(ids[0])).status).toBe("pushed");
    expect((await row(ids[1])).status).toBe("queued");
  });

  it("marks sent posts, records the X link and deletes the clip", async () => {
    const videoId = await video(5, true);
    await enqueueXPost({ videoId, clipId: makeClip(), caption: "x" }, prisma, mediaDir);
    await sync(fakeBuffer().api);
    const pushed = await row(videoId);
    expect(clipExists(pushed.clipFile)).toBe(true);

    const sent = post(pushed.bufferPostId!, "sent", {
      sentAt: "2026-11-07T10:00:00.000Z",
      externalLink: "https://x.com/Gayvideofun/status/1",
    });
    expect((await sync(fakeBuffer({ posts: [sent] }).api)).sent).toBe(1);
    const done = await row(videoId);
    expect(done).toMatchObject({ status: "sent", externalLink: "https://x.com/Gayvideofun/status/1", clipFile: null });
    expect(clipExists(pushed.clipFile)).toBe(false);
  });

  it("never posts a video twice", async () => {
    const videoId = await video(6, true);
    await enqueueXPost({ videoId, clipId: makeClip(), caption: "x" }, prisma, mediaDir);
    await sync(fakeBuffer().api);
    const second = makeClip();
    const again = await enqueueXPost({ videoId, clipId: second, caption: "again" }, prisma, mediaDir);
    expect(again).toMatchObject({ status: "pushed", warning: expect.stringContaining("not posted again") });
    expect(clipExists(`clip-${second}.mp4`)).toBe(false);
    expect(await prisma.socialPost.count({ where: { videoId } })).toBe(1);
  });

  it("retries a refused post with backoff, then gives up", async () => {
    const videoId = await video(7, true);
    await enqueueXPost({ videoId, clipId: makeClip(), caption: "x" }, prisma, mediaDir);
    const refuse = fakeBuffer({ create: async () => ({ ok: false, message: "Invalid video format" }) });
    let now = new Date("2026-11-07T00:00:00Z");
    await sync(refuse.api, {}, now);
    let current = await row(videoId);
    expect(current).toMatchObject({ status: "queued", attempts: 1, lastError: "Buffer: Invalid video format" });
    expect(current.nextAttemptAt!.getTime()).toBeGreaterThan(now.getTime());

    for (let i = 0; i < 6; i += 1) {
      now = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      await sync(refuse.api, {}, now);
    }
    current = await row(videoId);
    expect(current).toMatchObject({ status: "failed", attempts: 5 });
  });

  it("treats a full Buffer queue as 'wait', not as a failure", async () => {
    const videoId = await video(8, true);
    await enqueueXPost({ videoId, clipId: makeClip(), caption: "x" }, prisma, mediaDir);
    const full = fakeBuffer({ create: async () => ({ ok: false, message: "You've reached the queue limit" }) });
    await sync(full.api);
    expect(await row(videoId)).toMatchObject({ status: "queued", attempts: 0 });
  });

  it("does not double-post when the create call's outcome is unknown", async () => {
    const videoId = await video(9, true);
    await enqueueXPost({ videoId, clipId: makeClip(), caption: "Caption nine for X" }, prisma, mediaDir);
    const lost = fakeBuffer({
      create: async () => {
        throw new BufferError("Buffer unreachable: TimeoutError", "NETWORK", true, true);
      },
    });
    await sync(lost.api);
    expect((await row(videoId)).status).toBe("pushing");

    // Next cycle: Buffer did get it; it is adopted, not created again.
    const landed = post("bp-landed", "scheduled", {
      text: `Caption nine for X\n\nhttps://gayvideo.fun/watch/${videoId}`,
    });
    const { api, calls } = fakeBuffer({ posts: [landed] });
    await sync(api);
    expect(calls.create).toHaveLength(0);
    expect(await row(videoId)).toMatchObject({ status: "pushed", bufferPostId: "bp-landed" });
  });

  it("records a Buffer publishing error and keeps the API budget in reserve", async () => {
    const a = await video(10, true);
    await enqueueXPost({ videoId: a, clipId: makeClip(), caption: "x" }, prisma, mediaDir);
    await sync(fakeBuffer().api);
    const failedPost = post((await row(a)).bufferPostId!, "error", { error: { message: "Media too long" } });
    await sync(fakeBuffer({ posts: [failedPost] }).api);
    expect(await row(a)).toMatchObject({ status: "failed", lastError: "Buffer: Media too long" });

    const b = await video(11, true);
    await enqueueXPost({ videoId: b, clipId: makeClip(), caption: "x" }, prisma, mediaDir);
    const low = fakeBuffer({ remaining: 20 });
    expect((await sync(low.api)).skipped).toBe("rate-limit");
    expect(low.calls.create).toHaveLength(0);
  });

  it("does nothing with Buffer when it is not configured", async () => {
    const videoId = await video(12, true);
    await enqueueXPost({ videoId, clipId: makeClip(), caption: "x" }, prisma, mediaDir);
    const { api, calls } = fakeBuffer();
    expect((await sync(api, { enabled: false })).skipped).toBe("disabled");
    expect(calls.list + calls.create.length).toBe(0);
    expect((await row(videoId)).status).toBe("queued");
  });
});
