import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { loginAdmin } from "./helpers";

// A draft whose Video.status is REMOVED stays off the site after approval
// (/watch answers 410): the review card says so instead of looking normal.

const prisma = new PrismaClient();
const PREFIX = "e2e-review-removed-";

async function cleanUp() {
  await prisma.mirror.deleteMany({ where: { videoId: { startsWith: PREFIX } } });
  await prisma.video.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

async function draft(id: string, status: "AVAILABLE" | "REMOVED", removedBy: string | null, createdAt: number) {
  await prisma.video.create({
    data: {
      id,
      slug: id,
      title: id,
      status,
      removedBy,
      isPublished: false,
      isHidden: false,
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
  const future = Date.now() + 400 * 24 * 3600 * 1000;
  await draft(`${PREFIX}gone`, "REMOVED", "health", future + 2000);
  await draft(`${PREFIX}fine`, "AVAILABLE", null, future + 1000);
});

test.afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

test("a REMOVED draft says approving will not put it on the site", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/review");
  const card = (id: string) =>
    page.locator("article").filter({ has: page.locator(`a[href="/admin/videos/${id}"]`) }).first();

  const gone = card(`${PREFIX}gone`);
  await expect(gone).toBeVisible();
  const warning = gone.getByRole("status").filter({ hasText: "Trạng thái REMOVED" });
  await expect(warning).toContainText("health check không thấy file trên host");
  await expect(warning).toContainText("trang xem trả 410");

  const fine = card(`${PREFIX}fine`);
  await expect(fine).toBeVisible();
  await expect(fine.getByText("Trạng thái", { exact: false })).toHaveCount(0);
});
