import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  addAgeCookie,
  AVAILABLE_SLUG,
  expectNoHorizontalOverflow,
  loginAdmin,
} from "./helpers";

const widths = [1440, 1280, 1024, 768, 390, 375, 360, 320] as const;
const commonLigatures = [
  "home",
  "search",
  "menu",
  "more_horiz",
  "grid_view",
  "local_fire_department",
  "arrow_forward",
  "close",
] as const;

async function expectNoSeriousAxeViolations(page: Page, label: string) {
  // T37 gate: serious and critical axe findings must remain empty across representative routes.
  const result = await new AxeBuilder({ page }).analyze();
  const severeViolations = result.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    severeViolations,
    label + ": " + severeViolations.map((item) => item.id).join(", "),
  ).toEqual([]);
}

async function expectMaterialSymbolsReady(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const fontReady = await page.evaluate(() =>
    document.fonts.check('20px "Material Symbols Rounded"'),
  );
  expect(fontReady).toBe(true);

  const visibleSymbols = page.locator(".material-symbols-rounded:visible");
  const count = await visibleSymbols.count();
  expect(count).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const symbol = visibleSymbols.nth(index);
    const text = (await symbol.textContent())?.trim() ?? "";
    if (!commonLigatures.includes(text as (typeof commonLigatures)[number])) {
      continue;
    }
    await expect(symbol).toHaveCSS("font-family", /Material Symbols Rounded/);
  }
}

for (const width of widths) {
  test(`responsive regression at ${width}px has no document overflow`, async ({
    page,
    context,
  }) => {
    await addAgeCookie(context);
    await page.setViewportSize({
      width,
      height: width <= 390 ? 844 : 900,
    });

    for (const path of [
      "/latest",
      "/categories",
      "/content-removal/request",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expectNoHorizontalOverflow(page);
    }

    await loginAdmin(page);
    await page.goto("/admin/hosts");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
  });
}

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
  expect(second?.y ?? 0).toBeGreaterThan(
    (first?.y ?? 0) + (first?.height ?? 0) - 2,
  );
});

test("common Material Symbols render as icons instead of visible ligature text", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expectMaterialSymbolsReady(page);

  const leakedLigatures = await page.evaluate((names) => {
    const expected = new Set<string>(names);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const leaks: string[] = [];

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const text = node.textContent?.trim() ?? "";
      if (!expected.has(text)) continue;

      const parent = node.parentElement;
      if (!parent || parent.closest(".material-symbols-rounded")) continue;
      const style = getComputedStyle(parent);
      if (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") > 0
      ) {
        leaks.push(text);
      }
    }

    return leaks;
  }, [...commonLigatures]);

  expect(leakedLigatures).toEqual([]);
});

test("axe has no serious or critical findings on key public, legal and admin views", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);

  for (const path of [
    "/",
    "/latest",
    "/categories",
    "/search?q=Morning",
    "/content-removal/request",
    "/content-removal/dmca",
    "/watch/" + AVAILABLE_SLUG,
  ]) {
    await page.goto(path);
    await expectNoSeriousAxeViolations(page, path);
  }

  await page.goto("/watch/" + AVAILABLE_SLUG);
  await page.getByRole("button", { name: "Report" }).click();
  await expectNoSeriousAxeViolations(page, "report dialog");

  await loginAdmin(page);
  for (const path of ["/admin", "/admin/hosts"]) {
    await page.goto(path);
    await expectNoSeriousAxeViolations(page, path);
  }
});

test("keyboard focus works for search, report dialog and age gate", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "I'm 18 or older" })).toBeFocused();
  await page.getByRole("button", { name: "I'm 18 or older" }).click();

  await page.keyboard.press("Control+K");
  const search = page
    .getByPlaceholder("Search videos, categories or tags")
    .first();
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search).toHaveAttribute("aria-expanded", "false");

  await page.goto("/watch/" + AVAILABLE_SLUG);
  const reportButton = page.getByRole("button", { name: "Report" });
  await reportButton.focus();
  await reportButton.press("Enter");
  await expect(
    page.getByRole("button", { name: "Close report dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(reportButton).toBeFocused();
});
