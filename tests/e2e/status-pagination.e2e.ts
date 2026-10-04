import { expect, test } from "@playwright/test";

import { addAgeCookie } from "./helpers";

test("REMOVED/BLOCKED return 410 while draft/hidden return 404", async ({
  request,
}) => {
  for (const slug of ["removed-example-video", "blocked-example-video"]) {
    const response = await request.get("/watch/" + slug);
    expect(response.status(), slug).toBe(410);
  }

  for (const slug of ["draft-status-seed-video", "hidden-seed-video"]) {
    const response = await request.get("/watch/" + slug);
    expect(response.status(), slug).toBe(404);
  }
});

test("Load More enhances but crawlable page links remain the fallback", async ({
  page,
  context,
  browser,
}) => {
  await addAgeCookie(context);
  await page.goto("/latest");

  const before = await page.locator('a[href^="/watch/"]').count();
  const loadMore = page.getByRole("button", { name: "Load more videos" });
  await expect(loadMore).toBeVisible();
  await loadMore.click();
  await expect(page).toHaveURL(/page=2/);
  const after = await page.locator('a[href^="/watch/"]').count();
  expect(after).toBeGreaterThan(before);

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  await addAgeCookie(noJs);
  const noJsPage = await noJs.newPage();

  for (const { path, heading } of [
    { path: "/latest?page=2", heading: "Latest Videos" },
    { path: "/hot?page=2", heading: "Hot Videos" },
    { path: "/most-viewed?page=2", heading: "Most Viewed Videos" },
  ]) {
    await noJsPage.goto(path);
    await expect(noJsPage.getByRole("heading", { name: heading })).toBeVisible();
    await expect(noJsPage.getByRole("link", { name: "2", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(noJsPage.getByRole("link", { name: "Previous" })).toBeVisible();
  }

  await noJs.close();
});
