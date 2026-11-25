import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { attachClip, cleanReason, listPendingClips, recutClip, reportClipFailure } from "./clipJobs";
import { clipDir } from "./clips";
import type { SocialConfig } from "./config";
import { DISPATCH_SETTING, gitHubActions, readDispatchState, requestClipRun, runClipDispatch, type GitHubActions } from "./dispatch";

const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "e2e-dispatch-";

function config(token = "github_pat_TEST"): SocialConfig {
  return {
    enabled: false,
    apiKey: "",
    channelId: null,
    organizationId: null,
    xHandle: "Gayvideofun",
    queueLimit: 10,
    syncMinutes: 120,
    rateReserve: 50,
    clipSeconds: 120,
    clipMaxBytes: 512 * 1024 * 1024,
    maxVideoSeconds: 140,
    dispatch: { token, repository: "owner/repo", workflow: "x-clips.yml", ref: "main", debounceSeconds: 90 },
  };
}

function fakeGitHub(active = 0): GitHubActions & { dispatched: number } {
  const github = {
    dispatched: 0,
    activeRuns: vi.fn(async () => active),
    dispatch: vi.fn(async () => {
      github.dispatched += 1;
    }),
  };
  return github;
}

describe("gitHubActions client", () => {
  it("calls the workflow endpoints and never puts the token in errors", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return String(url).includes("/runs?") ? Response.json({ total_count: 1 }) : new Response(null, { status: 204 });
    });
    const github = gitHubActions(config().dispatch, ok as unknown as typeof fetch);
    expect(await github.activeRuns()).toBe(2);
    await github.dispatch();
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.github.com/repos/owner/repo/actions/workflows/x-clips.yml/runs?status=queued&per_page=1",
      "https://api.github.com/repos/owner/repo/actions/workflows/x-clips.yml/runs?status=in_progress&per_page=1",
      "https://api.github.com/repos/owner/repo/actions/workflows/x-clips.yml/dispatches",
    ]);
    expect(calls[2].init.method).toBe("POST");
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ ref: "main" });
    expect((calls[2].init.headers as Record<string, string>).Authorization).toBe("Bearer github_pat_TEST");

    const denied = gitHubActions(config().dispatch, (async () => new Response("bad credentials github_pat_TEST", { status: 401 })) as unknown as typeof fetch);
    const error = await denied.dispatch().catch((caught: Error) => caught);
    expect(String(error)).toContain("GitHub HTTP 401");
    expect(String(error)).not.toContain("github_pat_TEST");
  });
});

describe("cleanReason", () => {
  it("drops links, tokens and long ids", () => {
    const reason = cleanReason("Drive https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view gv_abcdefghijkl 1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    expect(reason).not.toMatch(/https?:|gv_abc|1AbCd/);
  });
});

describe.skipIf(!databaseUrl)("clip workflow dispatch and API (database)", () => {
  const prisma = new PrismaClient();
  const mediaDir = mkdtempSync(path.join(tmpdir(), "gv-dispatch-"));
  let videoId = "";
  let postId = "";

  async function cleanUp() {
    const videos = await prisma.video.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true } });
    const ids = videos.map((video) => video.id);
    await prisma.socialPost.deleteMany({ where: { videoId: { in: ids } } });
    await prisma.mirror.deleteMany({ where: { videoId: { in: ids } } });
    await prisma.video.deleteMany({ where: { id: { in: ids } } });
    await prisma.setting.deleteMany({ where: { key: DISPATCH_SETTING } });
  }

  // Other tests' posts must not count here: park them (not due) meanwhile.
  const parked = new Date("2099-01-01T00:00:00Z");
  let parkedIds: string[] = [];

  beforeAll(async () => {
    await cleanUp();
    const others = await prisma.socialPost.findMany({
      where: { status: "preparing", nextAttemptAt: null, video: { slug: { not: { startsWith: PREFIX } } } },
      select: { id: true },
    });
    parkedIds = others.map((row) => row.id);
    await prisma.socialPost.updateMany({ where: { id: { in: parkedIds } }, data: { nextAttemptAt: parked } });
  });

  beforeEach(async () => {
    await cleanUp();
    const video = await prisma.video.create({
      data: {
        slug: `${PREFIX}one`,
        title: "Dispatch One",
        status: "AVAILABLE",
        isPublished: true,
        publishedAt: new Date(),
        durationSeconds: 600,
        mirrors: {
          create: {
            hostId: "dood",
            fileCode: `${PREFIX}dd1`,
            rawTitle: "x",
            normalizedName: "x",
            embedUrl: "https://example.test/e/x",
            status: "OK",
            matchedBy: "AUTO",
          },
        },
      },
    });
    videoId = video.id;
    const post = await prisma.socialPost.create({
      data: { videoId, network: "x", status: "preparing", caption: "Hi", clipMode: "clip", clipStart: 30, clipSeconds: 120 },
    });
    postId = post.id;
  });

  afterAll(async () => {
    await prisma.socialPost.updateMany({ where: { id: { in: parkedIds }, nextAttemptAt: parked }, data: { nextAttemptAt: null } });
    await cleanUp();
    await prisma.$disconnect();
    rmSync(mediaDir, { recursive: true, force: true });
  });

  it("waits for approvals to settle, then dispatches once", async () => {
    const t0 = new Date("2026-11-24T10:00:00Z");
    await requestClipRun(t0, prisma);
    await requestClipRun(new Date(t0.getTime() + 40_000), prisma); // a second approval
    const github = fakeGitHub();
    const early = await runClipDispatch({ now: new Date(t0.getTime() + 100_000), client: prisma, config: config(), github });
    expect(early.outcome).toBe("debounce"); // 60 s after the last approval
    const due = await runClipDispatch({ now: new Date(t0.getTime() + 140_000), client: prisma, config: config(), github });
    expect(due.outcome).toBe("dispatched");
    expect(github.dispatched).toBe(1);
    expect(due.state.requestedAt).toBeNull();
    // Next minute: the run is starting; nothing else is dispatched.
    const after = await runClipDispatch({ now: new Date(t0.getTime() + 200_000), client: prisma, config: config(), github });
    expect(after.outcome).not.toBe("dispatched");
    expect(github.dispatched).toBe(1);
  });

  it("does not dispatch while a run is queued or in progress", async () => {
    const t0 = new Date("2026-11-24T11:00:00Z");
    await requestClipRun(t0, prisma);
    const busy = fakeGitHub(1);
    const result = await runClipDispatch({ now: new Date(t0.getTime() + 120_000), client: prisma, config: config(), github: busy });
    expect(result.outcome).toBe("running");
    expect(busy.dispatched).toBe(0);
    expect(result.state.requestedAt).not.toBeNull(); // kept for the next run
  });

  it("records GitHub errors for the admin and retries later", async () => {
    const t0 = new Date("2026-11-24T12:00:00Z");
    await requestClipRun(t0, prisma);
    const failing: GitHubActions = {
      activeRuns: async () => 0,
      dispatch: async () => {
        throw new (await import("./dispatch")).GitHubError("GitHub HTTP 403: token thiếu quyền");
      },
    };
    const result = await runClipDispatch({ now: new Date(t0.getTime() + 120_000), client: prisma, config: config(), github: failing });
    expect(result.outcome).toBe("error");
    expect(result.state.message).toContain("403");
    const soon = await runClipDispatch({ now: new Date(t0.getTime() + 180_000), client: prisma, config: config(), github: fakeGitHub() });
    expect(soon.outcome).toBe("backoff");

    const noToken = await runClipDispatch({ now: new Date(t0.getTime() + 600_000), client: prisma, config: config(""), immediate: true });
    expect(noToken.outcome).toBe("error");
    expect(noToken.state.message).toContain("GAYVIDEO_CLIP_DISPATCH");
  });

  it("'Chạy cắt clip ngay' skips the wait; nothing pending means idle", async () => {
    const github = fakeGitHub();
    const now = new Date("2026-11-24T13:00:00Z");
    expect((await runClipDispatch({ now, client: prisma, config: config(), github, immediate: true })).outcome).toBe("dispatched");
    await prisma.socialPost.update({ where: { id: postId }, data: { status: "queued" } });
    expect((await runClipDispatch({ now, client: prisma, config: config(), github, immediate: true })).outcome).toBe("idle");
    expect((await readDispatchState(prisma)).requestedAt).toBeNull();
  });

  it("lists pending posts and attaches a clip", async () => {
    const pending = await listPendingClips(new Date(), prisma);
    const mine = pending.find((post) => post.postId === postId)!;
    expect(mine).toMatchObject({ mode: "clip", start: 30, seconds: 120, durationSeconds: 600 });
    expect(mine.mirrors).toMatchObject([{ host: "dood", fileCode: `${PREFIX}dd1` }]);

    const clipId = "A".repeat(22);
    const directory = clipDir(mediaDir);
    (await import("node:fs")).mkdirSync(directory, { recursive: true });
    // Not an MP4: findClip refuses it.
    writeFileSync(path.join(directory, `clip-${clipId}.mp4`), "nope");
    await expect(attachClip({ postId, clipId, source: "drive" }, prisma, mediaDir)).rejects.toMatchObject({ code: "unknown_clip" });
  });

  it("'Thử lại' / 'Cắt lại' sends a failed or not-yet-pushed post back, never one in Buffer", async () => {
    await prisma.socialPost.update({ where: { id: postId }, data: { status: "failed", attempts: 3, lastError: "x" } });
    expect(await recutClip(postId, prisma, mediaDir)).toBe(true);
    expect(await prisma.socialPost.findUniqueOrThrow({ where: { id: postId } })).toMatchObject({
      status: "preparing",
      attempts: 0,
      lastError: null,
      clipFile: null,
    });
    await prisma.socialPost.update({ where: { id: postId }, data: { status: "pushed" } });
    expect(await recutClip(postId, prisma, mediaDir)).toBe(false);
  });

  it("retries failures twice, then marks the post failed", async () => {
    const now = new Date("2026-11-24T14:00:00Z");
    const first = await reportClipFailure({ postId, reason: "EarnVids: HTTP 403 https://secret.example/x" }, now, prisma);
    expect(first.status).toBe("preparing");
    expect(first.nextAttemptAt?.toISOString()).toBe("2026-11-24T14:15:00.000Z");
    const row = await prisma.socialPost.findUniqueOrThrow({ where: { id: postId } });
    expect(row.lastError).toContain("EarnVids: HTTP 403");
    expect(row.lastError).not.toContain("secret.example");
    // Not due yet: not listed.
    expect((await listPendingClips(now, prisma)).some((post) => post.postId === postId)).toBe(false);
    await reportClipFailure({ postId, reason: "again" }, now, prisma);
    const last = await reportClipFailure({ postId, reason: "again" }, now, prisma);
    expect(last.status).toBe("failed");
  });
});
