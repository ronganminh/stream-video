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
  await expect(
    page.getByRole("heading", { name: "Morning Gym Session with Marco" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Play Morning Gym Session with Marco" })
    .click();
  const servers = page.getByRole("group", { name: "Video servers" });
  await servers.getByRole("button", { name: "2", exact: true }).click();
  await expect(
    servers.getByRole("button", { name: "2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const related = page
    .getByRole("heading", { name: "More like this", exact: true })
    .locator("xpath=ancestor::section[1]");
  const relatedLink = related.getByRole("link").first();
  await expect(relatedLink).toBeVisible();
  await relatedLink.click();
  await expect(page).toHaveURL(/\/watch\//);

  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  const categoryLink = breadcrumbs.getByRole("link").nth(1);
  await categoryLink.click();
  await expect(page).toHaveURL(/\/category\//);

  await page.getByLabel("Duration", { exact: true }).selectOption("under-5");
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
  await expect(
    page.getByRole("heading", { name: "Morning Gym Session with Marco" }),
  ).toBeVisible();
});

test("report flow submits and returns a reference", async ({ page, context }) => {
  await addAgeCookie(context);
  await page.goto("/watch/" + AVAILABLE_SLUG);

  await page.getByRole("button", { name: "Report" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Report this video" }),
  ).toBeVisible();

  await dialog.getByRole("radio", { name: "Other" }).check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog
    .getByPlaceholder("Anything that helps the review")
    .fill("E2E report details");
  await dialog.getByRole("button", { name: "Submit report" }).click();

  await expect(
    dialog.getByRole("heading", { name: "Report received" }),
  ).toBeVisible();
  await expect(dialog.getByText(/Reference · R-/)).toBeVisible();
});

test("public shell keeps one main landmark and semantic menu buttons", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);

  for (const path of [
    "/",
    "/latest",
    "/search?q=Morning",
    "/content-removal/request",
  ]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await expect(page.getByRole("main")).toHaveCount(1);
  }

  await page.goto("/");
  const desktopMore = page
    .locator("header:visible")
    .getByRole("button", { name: "More navigation" });
  await expect(desktopMore).toBeVisible();
  await expect(desktopMore).toHaveAttribute("aria-expanded", "false");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/latest");
  await expect(page.getByRole("main")).toHaveCount(1);

  const mobileMenu = page
    .locator("header:visible")
    .getByRole("button", { name: "Open navigation menu" });
  await expect(mobileMenu).toBeVisible();
  await expect(mobileMenu).toHaveAttribute("aria-expanded", "false");

  const mobileMore = page
    .getByRole("navigation", { name: "Mobile primary navigation" })
    .getByRole("button", { name: "More navigation" });
  await expect(mobileMore).toBeVisible();
  await expect(mobileMore).toHaveAttribute("aria-expanded", "false");
});

test("footer destinations remain real routes", async ({ page, context }) => {
  await addAgeCookie(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const footer = page.locator("footer");
  for (const [label, href] of [
    ["Categories", "/categories"],
    ["Report Content", "/content-removal/request"],
    ["Content Removal", "/content-removal"],
    ["DMCA", "/content-removal/dmca"],
    ["Terms", "/terms"],
    ["Privacy", "/privacy"],
    ["Cookies", "/cookies"],
  ] as const) {
    await expect(
      footer.getByRole("link", { name: label, exact: true }).first(),
    ).toHaveAttribute("href", href);
  }

  await expect(
    footer.getByRole("link", { name: "About", exact: true }),
  ).toHaveCount(0);
  await expect(
    footer.getByRole("link", { name: "Contact", exact: true }),
  ).toHaveCount(0);
});

test("contextual empty states offer the expected recovery actions", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);

  await page.goto("/search?q=qzxvkpjmnrw");
  await expect(
    page.getByRole("heading", {
      name: "No videos found for “qzxvkpjmnrw”",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse Hot" })).toBeVisible();

  await page.goto("/latest?category=t37-no-such-category-zzzz");
  await expect(
    page.getByRole("heading", { name: "No videos match these filters" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Clear filters" }),
  ).toHaveAttribute("href", "/latest");

  await page.goto("/categories");
  await page
    .getByPlaceholder("Filter categories")
    .fill("t37-no-such-category-zzzz");
  await expect(
    page.getByRole("heading", { name: "No categories match that filter" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear filter" }),
  ).toBeVisible();
});

test("favicon resolves and unknown routes keep true 404 metadata", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);

  const iconResponse = await page.request.get("/favicon.ico");
  expect(iconResponse.status()).toBe(200);
  expect((await iconResponse.body()).byteLength).toBeGreaterThan(100);

  const response = await page.goto("/t37-this-route-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("Page not found | GayVideo.fun");
  await expect(page.getByRole("main")).toHaveCount(1);

  const robots = page.locator('meta[name="robots"]');
  await expect(robots.first()).toHaveAttribute("content", /noindex/i);
  await expect(page.getByRole("link", { name: "Go Home" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Browse Hot Videos" }),
  ).toBeVisible();
});
