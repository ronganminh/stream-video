import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import { loginAdmin } from "./helpers";

test.describe.configure({ mode: "serial", retries: 0 });

const prisma = new PrismaClient();
const PREFIX = "e2e-review-";
const DRAFTS = 12;

function draftId(index: number) {
  return `${PREFIX}${String(index).padStart(2, "0")}`;
}

async function removeDrafts() {
  const where = { videoId: { startsWith: PREFIX } };
  await prisma.adminAction.deleteMany({ where: { target: { startsWith: PREFIX } } });
  await prisma.videoTag.deleteMany({ where });
  await prisma.mirror.deleteMany({ where });
  await prisma.setting.deleteMany({ where: { key: { contains: PREFIX } } });
  await prisma.video.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

test.beforeAll(async () => {
  await removeDrafts();
  const now = Date.now();
  for (let index = 0; index < DRAFTS; index += 1) {
    const id = draftId(index);
    await prisma.video.create({
      data: {
        id,
        slug: id,
        title: `Review Draft ${index}`,
        status: "AVAILABLE",
        isPublished: false,
        isHidden: false,
        thumbnailPath: "/brand/logo-mark.svg",
        // Newest first in the queue: draft 00 is the top card.
        createdAt: new Date(now + (DRAFTS - index) * 1000),
        mirrors: {
          create: {
            hostId: "voe",
            fileCode: `${id}-voe`,
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
});

test.afterAll(async () => {
  await removeDrafts();
  await prisma.$disconnect();
});

// Hold server actions so the test can see what the admin sees while one runs.
async function delayActions(page: Page, ms: number) {
  await page.route("**/admin/review**", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.continue();
  });
}

async function watchLayoutShifts(page: Page) {
  await page.addInitScript(() => {
    const shifts: { value: number; recent: boolean }[] = [];
    (window as unknown as { __shifts: typeof shifts }).__shifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        shifts.push({ value: entry.value, recent: entry.hadRecentInput });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function cls(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __shifts: { value: number; recent: boolean }[] }).__shifts
      .filter((shift) => !shift.recent)
      .reduce((sum, shift) => sum + shift.value, 0),
  );
}

function editorLink(index: number) {
  return `a[href="/admin/videos/${draftId(index)}"]`;
}

function card(page: Page, index: number) {
  return page.locator("article").filter({ has: page.locator(editorLink(index)) });
}

test("queue shows ten cards per page with players behind a facade", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/review");

  await expect(page.locator("article")).toHaveCount(10);
  await expect(page.getByRole("navigation", { name: "Review queue pages" })).toBeVisible();
  await expect(page.locator("article iframe")).toHaveCount(0);

  const first = card(page, 0);
  await first.getByRole("button", { name: /Play preview · VOE: Review Draft 0$/ }).click();
  await expect(first.locator("iframe")).toHaveAttribute("src", /example\.invalid\/e\/e2e-review-00/);
  await expect(page.locator("article iframe")).toHaveCount(1);

  // Thumbnails sit in a fixed 16:9 frame whether or not they have loaded.
  const box = await first.locator(`[class*="lazyThumb"]`).first().boundingBox();
  expect(box && Math.round((box.width / box.height) * 9)).toBe(16);
});

test("approve swaps the card for a row at once, keeps its slot, and stays stable", async ({
  page,
}) => {
  await watchLayoutShifts(page);
  await delayActions(page, 800);
  await loginAdmin(page);
  await page.goto("/admin/review");

  const target = card(page, 1);
  const approve = target.getByRole("button", { name: "Approve & publish" });
  await approve.scrollIntoViewIfNeeded();
  await approve.click();

  // Optimistic: the row is there while the action is still held.
  const row = page.getByRole("status").filter({ hasText: "Review Draft 1" });
  await expect(row).toContainText("Publishing", { timeout: 300 });
  await expect(target).toBeHidden();

  await expect(row).toContainText("Published");
  await expect(row.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect.poll(async () =>
    (await prisma.video.findUnique({ where: { id: draftId(1) } }))?.isPublished,
  ).toBe(true);

  // Publishing purges the cached public lists.
  const onLatest = async () =>
    (await (await page.request.get("/latest")).text()).includes(`/watch/${draftId(1)}`);
  await expect.poll(onLatest).toBe(true);

  // The row kept card 1's slot: it sits between cards 0 and 2, and the next
  // draft from page 2 was appended at the bottom.
  const slots = page.locator(`main [class*="slot"]`);
  await expect(slots.nth(1)).toContainText("Review Draft 1");
  await expect(slots.nth(2).locator(editorLink(2))).toBeAttached();
  await expect(slots.last().locator(editorLink(10))).toBeAttached();

  await page.waitForTimeout(1000);
  const shift = await cls(page);
  console.log(`review approve CLS (excluding recent input): ${shift.toFixed(4)}`);
  expect(shift).toBeLessThan(0.05);

  // Undo restores the card in the same slot.
  await row.getByRole("button", { name: "Undo" }).click();
  await expect(card(page, 1)).toBeVisible();
  await expect(slots.nth(1).locator(editorLink(1))).toBeVisible();
  await expect.poll(async () =>
    (await prisma.video.findUnique({ where: { id: draftId(1) } }))?.isPublished,
  ).toBe(false);
  // ...and so does unpublishing: /latest drops it again.
  await expect.poll(onLatest).toBe(false);
});

test("buttons lock while an action runs", async ({ page }) => {
  await delayActions(page, 800);
  await loginAdmin(page);
  await page.goto("/admin/review");

  const target = card(page, 3);
  await target.getByRole("button", { name: "Save draft" }).click();

  await expect(target.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(target.getByRole("button", { name: "Approve & publish" })).toBeDisabled();
  await expect(target.getByRole("button", { name: "Reject" })).toBeDisabled();

  await expect(target.getByRole("status")).toHaveText("Draft saved.");
  await expect(target.getByRole("button", { name: "Approve & publish" })).toBeEnabled();
});

test("a failed approve brings the card back with the admin's edits and the error", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/review");

  const target = card(page, 4);
  await target.getByLabel("Title").fill("Edited Title Survives");
  // Another draft already uses this slug.
  await target.getByLabel("Slug").fill(draftId(5));
  await target.getByRole("button", { name: "Approve & publish" }).click();

  await expect(target.getByRole("alert")).toHaveText("Slug already exists.");
  await expect(target).toBeVisible();
  await expect(target.getByLabel("Title")).toHaveValue("Edited Title Survives");
  await expect(target.getByLabel("Slug")).toHaveValue(draftId(5));
  expect((await prisma.video.findUnique({ where: { id: draftId(4) } }))?.isPublished).toBe(false);
});

test("reject and undo", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/review");

  await card(page, 6).getByRole("button", { name: "Reject" }).click();
  const row = page.getByRole("status").filter({ hasText: "Review Draft 6" });
  await expect(row).toContainText("Rejected");
  expect((await prisma.video.findUnique({ where: { id: draftId(6) } }))?.isHidden).toBe(true);

  await row.getByRole("button", { name: "Undo" }).click();
  await expect(card(page, 6)).toBeVisible();
  expect((await prisma.video.findUnique({ where: { id: draftId(6) } }))?.isHidden).toBe(false);
});
