import { expect, test, type Page } from "@playwright/test";

import {
  addAgeCookie,
  expectNoHorizontalOverflow,
  loginAdmin,
} from "./helpers";

const MATERIAL_SYMBOL_FONT = '400 24px "Material Symbols Rounded"';
const PUBLIC_ROUTES = [
  "/",
  "/latest",
  "/search?q=gv001-cold-cache-no-results",
] as const;

async function expectContainedMaterialSymbols(
  page: Page,
  options: { requireIcons?: boolean } = {},
) {
  const icons = page.locator(".material-symbols-rounded");
  const count = await icons.count();

  if (options.requireIcons ?? true) {
    expect(count).toBeGreaterThan(0);
  }

  if (count === 0) {
    return;
  }

  const metrics = await icons.evaluateAll((nodes) =>
    nodes.map((node) => {
      const element = node as HTMLElement;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return {
        contain: style.contain,
        fontFamily: style.fontFamily,
        fontSize: Number.parseFloat(style.fontSize),
        height: rect.height,
        overflowX: style.overflowX,
        width: rect.width,
      };
    }),
  );

  for (const metric of metrics) {
    expect(metric.fontFamily).toContain("Material Symbols Rounded");
    expect(metric.contain).toContain("size");
    expect(metric.overflowX).toBe("hidden");
    expect(metric.width).toBeLessThanOrEqual(metric.fontSize + 1);
    expect(metric.height).toBeLessThanOrEqual(metric.fontSize + 1);
  }
}

async function expectMaterialSymbolsLoaded(
  page: Page,
  options: { requireIcons?: boolean } = {},
) {
  await expect
    .poll(
      () =>
        page.evaluate((font) => document.fonts.check(font), MATERIAL_SYMBOL_FONT),
      { timeout: 10_000 },
    )
    .toBe(true);

  await expectContainedMaterialSymbols(page, options);
}

test("Material Symbols stay icon-backed on cold cache at desktop, 390px and 320px", async ({
  browser,
}) => {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: width <= 390 ? 844 : 900 },
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await addAgeCookie(context);

    for (const path of PUBLIC_ROUTES) {
      await page.goto(path);
      await expectMaterialSymbolsLoaded(page);
      await expectNoHorizontalOverflow(page);
    }

    await context.close();
  }
});

test("fallback icon text cannot expand public layouts when the font request fails", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await context.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await addAgeCookie(context);

  for (const path of PUBLIC_ROUTES) {
    await page.goto(path);
    await expectContainedMaterialSymbols(page);
    await expectNoHorizontalOverflow(page);
  }

  await context.close();
});

test("Admin Hosts remains overflow-safe and contains any Material Symbols", async ({
  page,
}) => {
  await loginAdmin(page);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/admin/hosts");
    await expectMaterialSymbolsLoaded(page, { requireIcons: false });
    await expectNoHorizontalOverflow(page);
  }
});
