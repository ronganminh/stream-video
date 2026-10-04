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
  const matchCard = page.locator("article").filter({ hasText: "Draft Seed Video.mp4" });
  await expect(matchCard).toBeVisible();
  const suggestion = matchCard.locator("form").filter({ hasText: "Draft Seed Video" }).first();
  await suggestion.getByRole("button", { name: "Link" }).click();
  await expect(page.locator("article").filter({ hasText: "Draft Seed Video.mp4" })).toHaveCount(0);

  await page.goto("/admin/hosts");
  const voeRow = page.getByRole("row").filter({ hasText: "VOE" });
  await voeRow.locator('input[type="radio"][name="primaryHostId"]').check();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save hosts" }).click();
  await expect(page.getByRole("status")).toHaveText("Hosts saved.");

  await page.reload();
  const persistedVoeRow = page.getByRole("row").filter({ hasText: "VOE" });
  await expect(
    persistedVoeRow.locator('input[type="radio"][name="primaryHostId"]'),
  ).toBeChecked();
});
