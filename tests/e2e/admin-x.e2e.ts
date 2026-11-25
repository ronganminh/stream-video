import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import { loginAdmin } from "./helpers";

// Posting to X from /admin/review: the X fields on a card, the checks before
// approving, the post the clip workflow then picks up through the API, and
// the status in the admin. GitHub is not configured on the E2E server, so
// the panel says so and nothing is dispatched.

test.describe.configure({ mode: "serial", retries: 0 });

const prisma = new PrismaClient();
const PREFIX = "e2e-adminx-";
const token = "gv_" + randomBytes(32).toString("base64url");
const auth = { authorization: `Bearer ${token}` };
const dir = mkdtempSync(path.join(tmpdir(), "gv-adminx-"));
const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

async function cleanUp() {
  const where = { videoId: { startsWith: PREFIX } };
  await prisma.socialPost.deleteMany({ where });
  await prisma.adminAction.deleteMany({ where: { target: { startsWith: PREFIX } } });
  await prisma.videoTag.deleteMany({ where });
  await prisma.mirror.deleteMany({ where });
  await prisma.video.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.apiToken.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.setting.deleteMany({ where: { key: "social.x.clipDispatch" } });
}

async function draft(id: string, title: string, durationSeconds: number, createdAt: number) {
  await prisma.video.create({
    data: {
      id,
      slug: id,
      title,
      status: "AVAILABLE",
      isPublished: false,
      isHidden: false,
      durationSeconds,
      thumbnailPath: "/brand/logo-mark.svg",
      createdAt: new Date(createdAt),
      mirrors: {
        create: {
          hostId: "dood",
          fileCode: `${id}-dood`,
          rawTitle: `${id}.mp4`,
          normalizedName: id,
          embedUrl: `https://example.invalid/e/${id}`,
          status: "OK",
          matchedBy: "PRIMARY",
        },
      },
    },
  });
}

test.beforeAll(async () => {
  await cleanUp();
  // Far in the future, so these are the top cards of the queue.
  const future = Date.now() + 365 * 24 * 3600 * 1000;
  await draft(`${PREFIX}long`, "Trần Đức – Gym", 600, future + 3000);
  await draft(`${PREFIX}short`, "Short Beach Day", 95, future + 2000);
  await draft(`${PREFIX}none`, "No X Please", 300, future + 1000);
  const admin = await prisma.adminUser.findFirstOrThrow({ where: { email: "admin@gayvideo.test" } });
  await prisma.apiToken.create({
    data: { name: `${PREFIX}actions`, tokenHash: createHash("sha256").update(token).digest("hex"), adminId: admin.id },
  });
});

test.afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

function card(page: Page, id: string) {
  return page.locator("article").filter({ has: page.locator(`a[href="/admin/videos/${id}"]`) });
}

test("a card offers clip / keep whole / no X, with the template caption and live checks", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/review");
  const long = card(page, `${PREFIX}long`);
  const box = long.getByRole("group", { name: /Đăng X/ });
  await expect(box.getByRole("radio", { name: /Cắt clip \(2:00\)/ })).toBeChecked();
  await expect(box.getByRole("radio", { name: "Giữ nguyên" })).toBeVisible();
  await expect(box.getByRole("radio", { name: "Không đăng X" })).toBeVisible();
  const caption = box.getByRole("textbox", { name: /Caption X/ });
  await expect(caption).toHaveValue("New video: Tran Duc – Gym 🔥");
  await expect(box).toContainText("28/255");

  await caption.fill("Hot nude guy at the gym");
  await expect(box.getByRole("alert")).toContainText("có từ cấm: nude");

  // The server refuses it too: the card stays, nothing is published.
  await long.getByRole("button", { name: "Approve & publish" }).click();
  await expect(long.getByRole("alert").last()).toContainText("Caption X: có từ cấm: nude");
  expect((await prisma.video.findUniqueOrThrow({ where: { id: `${PREFIX}long` } })).isPublished).toBe(false);

  await caption.fill("Gym crush, finally on camera 😏");
  await box.getByRole("radio", { name: "Giữ nguyên" }).check();
  await expect(box).toContainText("Video dài 10:00, quá giới hạn X 2:20");
  await page.screenshot({ path: path.join("test-results", "admin-x-card.png"), fullPage: false });

  await long.getByRole("button", { name: "Approve & publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "X: đang xử lý clip (giữ nguyên)" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "tự cắt 2:20 đầu" })).toBeVisible();

  const post = await prisma.socialPost.findFirstOrThrow({ where: { videoId: `${PREFIX}long` } });
  expect(post).toMatchObject({
    status: "preparing",
    clipMode: "full",
    clipStart: 0,
    clipSeconds: 140,
    caption: "Gym crush, finally on camera 😏",
  });
  const dispatch = await prisma.setting.findUniqueOrThrow({ where: { key: "social.x.clipDispatch" } });
  expect((dispatch.value as { requestedAt: string | null }).requestedAt).not.toBeNull();
});

test("a clip from a start time, and 'Không đăng X' creates no post", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/review");
  const short = card(page, `${PREFIX}short`);
  await short.getByLabel("Bắt đầu từ giây").fill("20");
  await short.getByRole("button", { name: "Approve & publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "X: đang xử lý clip (từ 20s)" })).toBeVisible();
  expect(await prisma.socialPost.findFirstOrThrow({ where: { videoId: `${PREFIX}short` } })).toMatchObject({
    clipMode: "clip",
    clipStart: 20,
    clipSeconds: 75,
  });

  const none = card(page, `${PREFIX}none`);
  await none.getByRole("radio", { name: "Không đăng X" }).check();
  await expect(none.getByRole("textbox", { name: /Caption X/ })).toHaveCount(0);
  await none.getByRole("button", { name: "Approve & publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "X: không đăng" })).toBeVisible();
  expect(await prisma.socialPost.count({ where: { videoId: `${PREFIX}none` } })).toBe(0);
});

test("the panel shows the pending clips; without a GitHub token it says so", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/review");
  const panel = page.getByRole("region", { name: "Bài X và cắt clip" });
  // Ours are two; other tests' approvals may add some.
  const waiting = await prisma.socialPost.count({ where: { status: "preparing" } });
  expect(waiting).toBeGreaterThanOrEqual(2);
  await expect(panel).toContainText(`${waiting} đang chờ cắt clip`);
  await expect(panel).toContainText("Chưa có GAYVIDEO_CLIP_DISPATCH");
  await expect(panel.getByRole("button", { name: "Chạy cắt clip ngay" })).toBeDisabled();
  await expect(panel).toContainText("Trần Đức – Gym");

  await page.goto(`/admin/videos?published=true`);
  const row = page.locator("tr").filter({ hasText: "Trần Đức – Gym" });
  await expect(row.getByText("Đang xử lý clip")).toBeVisible();
});

test("the clip workflow API: pending list, attach a clip, report a failure", async ({ page, request }) => {
  test.skip(!hasFfmpeg, "needs ffmpeg");
  const pending = await (await request.get("/api/v1/social/pending", { headers: auth })).json();
  const long = pending.posts.find((post: { videoId: string }) => post.videoId === `${PREFIX}long`);
  expect(long).toMatchObject({ mode: "full", start: 0, seconds: 140, durationSeconds: 600 });
  // (Which host is primary is up to other tests; the mirror itself is what matters.)
  expect(long.mirrors).toMatchObject([{ host: "dood", fileCode: `${PREFIX}long-dood` }]);
  expect((await request.get("/api/v1/social/pending")).status()).toBe(401);

  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=3",
    "-f", "lavfi", "-i", "sine=duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-shortest", "-movflags", "+faststart", path.join(dir, "clip.mp4"),
  ]);
  const upload = await request.post("/api/v1/clips", {
    headers: { ...auth, "content-type": "video/mp4" },
    data: readFileSync(path.join(dir, "clip.mp4")),
  });
  const { clipId } = await upload.json();
  const attached = await request.post(`/api/v1/social/${long.postId}/clip`, {
    headers: auth,
    data: { clipId, source: "drive" },
  });
  expect(attached.status()).toBe(200);
  expect(await attached.json()).toEqual({ status: "queued" });
  expect(await prisma.socialPost.findUniqueOrThrow({ where: { id: long.postId } })).toMatchObject({
    status: "queued",
    clipSource: "drive",
    clipSeconds: 3,
  });

  const short = pending.posts.find((post: { videoId: string }) => post.videoId === `${PREFIX}short`);
  const failed = await request.post(`/api/v1/social/${short.postId}/failure`, {
    headers: auth,
    data: { reason: "EarnVids: HTTP 403 for https://secret.example/abc · Google Drive: quota" },
  });
  expect(await failed.json()).toMatchObject({ status: "preparing" });
  const row = await prisma.socialPost.findUniqueOrThrow({ where: { id: short.postId } });
  expect(row.lastError).toContain("EarnVids: HTTP 403");
  expect(row.lastError).not.toContain("secret.example");

  await loginAdmin(page);
  await page.goto(`/admin/videos?published=true`);
  await expect(page.locator("tr").filter({ hasText: "Trần Đức – Gym" }).getByText("Trong hàng đợi")).toBeVisible();

  // "Cắt lại": a clip not yet in Buffer goes back to the clip workflow.
  await page.goto("/admin/review");
  const panel = page.getByRole("region", { name: "Bài X và cắt clip" });
  await panel.locator("li").filter({ hasText: "Trần Đức – Gym" }).getByRole("button", { name: "Cắt lại" }).click();
  await expect(panel.getByRole("status")).toContainText("Đã đưa lại vào hàng cắt clip");
  expect(await prisma.socialPost.findUniqueOrThrow({ where: { id: long.postId } })).toMatchObject({
    status: "preparing",
    attempts: 0,
    clipFile: null,
  });
});

test("undoing an approval drops the X post that has not reached Buffer", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/review");
  const short = card(page, `${PREFIX}short`);
  // Approved in an earlier test: put it back as a draft through the editor's undo path.
  await prisma.video.update({ where: { id: `${PREFIX}short` }, data: { isPublished: false, publishedAt: null } });
  await page.reload();
  await short.getByRole("button", { name: "Approve & publish" }).click();
  const row = page.getByRole("status").filter({ hasText: "Short Beach Day" });
  await row.getByRole("button", { name: "Undo" }).click();
  await expect(short).toBeVisible();
  expect(await prisma.socialPost.findFirstOrThrow({ where: { videoId: `${PREFIX}short` } })).toMatchObject({
    status: "cancelled",
  });
});
