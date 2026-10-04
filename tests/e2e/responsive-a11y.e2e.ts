import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  addAgeCookie,
  AVAILABLE_SLUG,
  expectNoHorizontalOverflow,
} from "./helpers";

const widths = [1440, 1280, 1024, 768, 390, 375, 360, 320] as const;

test("required responsive widths have no horizontal overflow", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);

  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });

    for (const path of ["/", "/latest", "/watch/" + AVAILABLE_SLUG]) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("video grids collapse to one column below 340px", async ({ page, context }) => {
  await addAgeCookie(context);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/latest");

  const cards = page.locator('a[href^="/watch/"]');
  await expect(cards.nth(1)).toBeVisible();

  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(Math.abs((first?.x ?? 0) - (second?.x ?? 0))).toBeLessThan(2);
  expect(second?.y ?? 0).toBeGreaterThan((first?.y ?? 0) + (first?.height ?? 0) - 2);
});

test("axe has no serious or critical findings on core public states", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);

  for (const path of ["/", "/latest", "/search?q=Morning", "/watch/" + AVAILABLE_SLUG]) {
    await page.goto(path);
    const result = await new AxeBuilder({ page }).analyze();
    const severe = result.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(severe, path + ": " + severe.map((item) => item.id).join(", ")).toEqual([]);
  }

  await page.goto("/watch/" + AVAILABLE_SLUG);
  await page.getByRole("button", { name: "Report" }).click();
  const reportResult = await new AxeBuilder({ page }).analyze();
  const reportSevere = reportResult.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(reportSevere, reportSevere.map((item) => item.id).join(", ")).toEqual([]);
});

test("keyboard focus works for search, report dialog and age gate", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "I'm 18 or older" })).toBeFocused();
  await page.getByRole("button", { name: "I'm 18 or older" }).click();

  await page.keyboard.press("Control+K");
  const search = page.getByPlaceholder("Search videos, categories or tags").first();
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search).toHaveAttribute("aria-expanded", "false");

  await page.goto("/watch/" + AVAILABLE_SLUG);
  const reportButton = page.getByRole("button", { name: "Report" });
  await reportButton.focus();
  await reportButton.press("Enter");
  await expect(page.getByRole("button", { name: "Close report dialog" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(reportButton).toBeFocused();
});
