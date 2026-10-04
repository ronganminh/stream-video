import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { loginAdmin } from "./helpers";

test.describe.configure({ retries: 0 });

test("admin approve → manual mirror link → change primary host", async ({ page }) => {
  await loginAdmin(page);

  await page.goto("/admin/review");
  const draft = page.locator("article").filter({
    has: page.locator('a[href="/admin/videos/video-draft-seed"]'),
  });
  await expect(draft).toBeVisible();
  await draft.getByRole("button", { name: "Approve & publish" }).click();
  await expect(draft).toHaveCount(0);

  await page.goto("/admin/matching");
  const matchCard = page
    .locator("article")
    .filter({ hasText: "Draft Seed Video.mp4" });
  await expect(matchCard).toBeVisible();
  const suggestion = matchCard
    .locator("form")
    .filter({ hasText: "Draft Seed Video" })
    .first();
  await suggestion.getByRole("button", { name: "Link" }).click();
  await expect(
    page.locator("article").filter({ hasText: "Draft Seed Video.mp4" }),
  ).toHaveCount(0);

  await page.goto("/admin/hosts");
  const voeRow = page.getByRole("row").filter({ hasText: "VOE" });
  await voeRow
    .locator('input[type="radio"][name="primaryHostId"]')
    .check();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save hosts" }).click();
  await expect(page.getByRole("status")).toHaveText("Hosts saved.");

  await page.reload();
  const persistedVoeRow = page.getByRole("row").filter({ hasText: "VOE" });
  await expect(
    persistedVoeRow.locator('input[type="radio"][name="primaryHostId"]'),
  ).toBeChecked();
});

test("host order can be changed with keyboard-only controls and persists", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/hosts");

  const orderField = page.locator('input[name="order"]');
  await expect(orderField).toHaveValue('["dood","voe","earnvids"]');

  const moveEarnVidsUp = page.getByRole("button", {
    name: "Move EarnVids up",
  });
  await moveEarnVidsUp.focus();
  await expect(moveEarnVidsUp).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(orderField).toHaveValue('["dood","earnvids","voe"]');
  await page.getByRole("button", { name: "Save hosts" }).click();
  await expect(page.getByRole("status")).toHaveText("Hosts saved.");

  await page.reload();
  const rows = page
    .getByRole("table", { name: "Video hosts" })
    .getByRole("row");
  await expect(rows.nth(1)).toContainText("DoodStream");
  await expect(rows.nth(2)).toContainText("EarnVids");
  await expect(rows.nth(3)).toContainText("VOE");
});

test("dashboard sync timestamp is human-readable with explicit UTC and raw ISO metadata", async ({
  page,
}) => {
  const prisma = new PrismaClient();
  const id = "sync-run-t37-timestamp";
  const startedAt = new Date("2026-10-01T12:34:56.000Z");

  await prisma.syncRun.deleteMany({ where: { id } });
  await prisma.syncRun.create({
    data: {
      id,
      kind: "HEALTH",
      startedAt,
      finishedAt: new Date("2026-10-01T12:35:56.000Z"),
      created: 3,
      matched: 4,
      missing: 1,
      errors: [],
    },
  });

  try {
    await loginAdmin(page);
    await page.goto("/admin");

    const started = page.locator("time").filter({
      has: page.locator("xpath=ancestor::dd/preceding-sibling::dt[normalize-space()='Started']"),
    });
    const time = page.locator('time[datetime="2026-10-01T12:34:56.000Z"]');

    await expect(time).toBeVisible();
    await expect(time).toContainText(/Oct 1, 2026.*12:34:56 PM UTC/);
    await expect(time).not.toContainText("2026-10-01T12:34:56.000Z");
    await expect(time).toHaveAttribute(
      "title",
      "2026-10-01T12:34:56.000Z",
    );
    await expect(started).toHaveCount(1);
  } finally {
    await prisma.syncRun.deleteMany({ where: { id } });
    await prisma.$disconnect();
  }
});
