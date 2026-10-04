import { expect, test } from "@playwright/test";

import { acceptAgeGate, addAgeCookie, AVAILABLE_SLUG } from "./helpers";

test("desktop journey: age gate → search → watch → related → category → filter → Hot → home", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  const gate = page.getByRole("dialog");
  await expect(gate).toBeVisible();
  await expect(page.getByRole("button", { name: "I'm 18 or older" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Leave" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "I'm 18 or older" })).toBeFocused();
  await acceptAgeGate(page);

  const search = page.getByPlaceholder("Search videos, categories or tags").first();
  await search.fill("Morning Gym Session with Marco");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Morning/);

  await page
    .getByRole("link", { name: /Morning Gym Session with Marco/ })
    .first()
    .click();
  await expect(page).toHaveURL("/watch/" + AVAILABLE_SLUG);
  await expect(page.getByRole("heading", { name: "Morning Gym Session with Marco" })).toBeVisible();

  await page.getByRole("button", { name: "Play Morning Gym Session with Marco" }).click();
  const servers = page.getByRole("group", { name: "Video servers" });
  await servers.getByRole("button", { name: "2", exact: true }).click();
  await expect(servers.getByRole("button", { name: "2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const related = page.locator("section").filter({ hasText: "More like this" });
  const relatedLink = related.getByRole("link").first();
  await expect(relatedLink).toBeVisible();
  await relatedLink.click();
  await expect(page).toHaveURL(/\/watch\//);

  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  const categoryLink = breadcrumbs.getByRole("link").nth(1);
  await categoryLink.click();
  await expect(page).toHaveURL(/\/category\//);

  await page.getByLabel("Duration").selectOption("under-5");
  await expect(page).toHaveURL(/duration=under-5/);

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Hot", exact: true })
    .click();
  await expect(page).toHaveURL(/\/hot/);

  await page.getByRole("link", { name: "GayVideo.fun home" }).first().click();
  await expect(page).toHaveURL("/");
});

test("mobile search and watch path", async ({ page, context }) => {
  await addAgeCookie(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Search" }).click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();

  const input = dialog.getByPlaceholder("Search videos, categories or tags");
  await expect(input).toBeFocused();
  await input.fill("Morning Gym Session with Marco");
  await input.press("Enter");

  await expect(page).toHaveURL(/\/search\?q=Morning/);
  await page
    .getByRole("link", { name: /Morning Gym Session with Marco/ })
    .first()
    .click();
  await expect(page).toHaveURL("/watch/" + AVAILABLE_SLUG);
  await expect(page.getByRole("heading", { name: "Morning Gym Session with Marco" })).toBeVisible();
});

test("report flow submits and returns a reference", async ({ page, context }) => {
  await addAgeCookie(context);
  await page.goto("/watch/" + AVAILABLE_SLUG);

  await page.getByRole("button", { name: "Report" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Report this video" })).toBeVisible();

  await dialog.getByRole("radio", { name: "Other" }).check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByPlaceholder("Anything that helps the review").fill("E2E report details");
  await dialog.getByRole("button", { name: "Submit report" }).click();

  await expect(dialog.getByRole("heading", { name: "Report received" })).toBeVisible();
  await expect(dialog.getByText(/Reference · R-/)).toBeVisible();
});
