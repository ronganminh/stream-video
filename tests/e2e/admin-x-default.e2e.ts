import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import { loginAdmin } from "./helpers";

// Settings → "Mặc định đăng lên X khi duyệt" (on unless turned off): review
// cards start on "Cắt clip", and "Approve selected" creates the X posts too.

test.describe.configure({ mode: "serial", retries: 0 });

const prisma = new PrismaClient();
const PREFIX = "e2e-xdefault-";

async function cleanUp() {
  await prisma.socialPost.deleteMany({ where: { videoId: { startsWith: PREFIX } } });
  await prisma.adminAction.deleteMany({ where: { target: { startsWith: PREFIX } } });
  await prisma.mirror.deleteMany({ where: { videoId: { startsWith: PREFIX } } });
  await prisma.video.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.setting.deleteMany({ where: { key: { in: ["social.x.postByDefault", "social.x.clipDispatch"] } } });
}

async function draft(id: string, title: string, createdAt: number) {
  await prisma.video.create({
    data: {
      id,
      slug: id,
      title,
      status: "AVAILABLE",
      isPublished: false,
      isHidden: false,
      durationSeconds: 600,
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

const card = (page: Page, id: string) =>
  page.locator("article").filter({ has: page.locator(`a[href="/admin/videos/${id}"]`) }).first();

test.beforeAll(async () => {
  await cleanUp();
  // Far in the future: the top cards of the queue.
  const future = Date.now() + 500 * 24 * 3600 * 1000;
  await draft(`${PREFIX}a`, "Bèo – Phòng gym", future + 3000);
  await draft(`${PREFIX}b`, "Seachan đi biển", future + 2000);
  await draft(`${PREFIX}c`, "Đã có bài X", future + 1000);
  // c already has an X post (e.g. from Colab, or cancelled on purpose): kept.
  await prisma.socialPost.create({
    data: { videoId: `${PREFIX}c`, network: "x", status: "cancelled", caption: "chosen by hand", lastError: "Không đăng X" },
  });
});

test.afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

test("Settings can turn the 'Cắt clip' default off and on", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/review");
  const box = card(page, `${PREFIX}a`).getByRole("group", { name: /Đăng X/ });
  await expect(box.getByRole("radio", { name: /Cắt clip/ })).toBeChecked();

  await page.goto("/admin/settings");
  const toggle = page.getByRole("checkbox", { name: /Mặc định đăng lên X khi duyệt/ });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.getByRole("button", { name: "Save X captions" }).click();
  await expect(page).toHaveURL(/saved=settings/);

  await page.goto("/admin/review");
  await expect(box.getByRole("radio", { name: "Không đăng X" })).toBeChecked();

  await page.goto("/admin/settings");
  await page.getByRole("checkbox", { name: /Mặc định đăng lên X khi duyệt/ }).check();
  await page.getByRole("button", { name: "Save X captions" }).click();
  await expect(page).toHaveURL(/saved=settings/);
});

test("'Approve selected' posts to X by default; an existing X post is kept", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/review");
  for (const id of ["a", "b", "c"]) {
    await card(page, `${PREFIX}${id}`).getByRole("checkbox", { name: "Select for bulk approval" }).check();
  }
  await page.getByRole("button", { name: "Approve selected" }).click();
  await expect(card(page, `${PREFIX}a`)).toHaveCount(0);

  const posts = await prisma.socialPost.findMany({
    where: { videoId: { startsWith: PREFIX } },
    orderBy: { videoId: "asc" },
  });
  expect(posts.map((post) => [post.videoId.slice(PREFIX.length), post.status, post.clipMode, post.clipStart, post.clipSeconds, post.caption])).toEqual([
    ["a", "preparing", "clip", 0, 120, "Beo – Phong gym"],
    ["b", "preparing", "clip", 0, 120, "Seachan di bien"],
    ["c", "cancelled", null, null, null, "chosen by hand"],
  ]);
  const videos = await prisma.video.findMany({ where: { id: { startsWith: PREFIX } }, select: { isPublished: true } });
  expect(videos.every((video) => video.isPublished)).toBe(true);
  // The clip workflow is asked to run (it waits for approvals to settle).
  const dispatch = await prisma.setting.findUnique({ where: { key: "social.x.clipDispatch" } });
  expect((dispatch?.value as { requestedAt?: string | null } | undefined)?.requestedAt).toBeTruthy();
});
