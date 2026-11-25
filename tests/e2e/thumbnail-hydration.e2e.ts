import { expect, test } from "@playwright/test";

import { addAgeCookie, AVAILABLE_SLUG } from "./helpers";

// Thumbnails must show even when they load before the page's JavaScript
// runs (cached images, slow phones). They used to wait for React's onLoad,
// which never fires for an image that finished before hydration: the first
// Up Next and Popular cards stayed empty.

test("watch page thumbnails show before (and without) hydration", async ({ page }) => {
  await addAgeCookie(page.context());
  // JavaScript arrives 4 s late; images are as fast as the server.
  await page.route("**/_next/static/chunks/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await route.continue();
  });
  await page.goto(`/watch/${AVAILABLE_SLUG}`, { waitUntil: "commit" });

  const upNext = page.locator("aside section").filter({ has: page.getByRole("heading", { name: "Up Next" }) }).locator("img");
  const first = upNext.first();
  await expect(first).toBeVisible({ timeout: 3000 });
  // Loaded and painted while the scripts are still on their way.
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 3000 }).toBe(true);
  expect(await first.evaluate((img) => getComputedStyle(img).opacity)).toBe("1");
  // Above the fold: fetched eagerly.
  expect(await first.getAttribute("loading")).toBe("eager");

  // The player poster is preloaded with high priority.
  const preload = page.locator('link[rel="preload"][as="image"]');
  await expect(preload.first()).toHaveAttribute("fetchpriority", "high");
});
