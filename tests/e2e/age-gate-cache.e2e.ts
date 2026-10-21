import { expect, test } from "@playwright/test";

import { acceptAgeGate, addAgeCookie, AVAILABLE_SLUG } from "./helpers";

test("returning visitors never see the gate, even before hydration", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);
  // Stop at DOMContentLoaded: the overlay markup is in the cached HTML, so it
  // must already be hidden by the <head> boot script, not by React.
  await page.goto("/latest", { waitUntil: "domcontentloaded" });

  const state = await page.evaluate(() => {
    const overlay = document.querySelector('[role="dialog"]')?.parentElement;
    return {
      confirmed: document.documentElement.hasAttribute("data-gv-age-ok"),
      overlayDisplay: overlay ? getComputedStyle(overlay).display : "absent",
    };
  });
  expect(state.confirmed).toBe(true);
  expect(["none", "absent"]).toContain(state.overlayDisplay);

  await page.waitForLoadState("load");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Latest Videos" })).toBeVisible();
});

test("first-time visitors get the gate on cached pages and it stays dismissed", async ({
  page,
}) => {
  await page.goto("/hot");
  await expect(page.getByRole("dialog")).toBeVisible();
  await acceptAgeGate(page);

  await page.goto("/tag/gym");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/watch/" + AVAILABLE_SLUG);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("cached public HTML is identical with and without the age cookie", async ({
  playwright,
  baseURL,
}) => {
  const anonymous = await playwright.request.newContext({ baseURL });
  const confirmed = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { cookie: "gv_age_ack=1" },
  });

  for (const path of ["/latest", "/latest?page=2", "/watch/" + AVAILABLE_SLUG]) {
    // Prime, then compare two cache hits.
    await anonymous.get(path);
    const [a, b] = await Promise.all([anonymous.get(path), confirmed.get(path)]);
    expect(["HIT", "STALE"], path).toContain(a.headers()["x-nextjs-cache"]);
    expect(await b.text(), path).toBe(await a.text());
    expect(await a.text(), path).toContain("Adults Only");
  }

  await anonymous.dispose();
  await confirmed.dispose();
});

test("public pages are cached; filters, search, admin and API are not", async ({
  request,
}) => {
  for (const path of [
    "/",
    "/latest",
    "/latest?page=2",
    "/hot?page=2",
    "/categories",
    "/tag/gym",
    "/most-viewed?page=2",
    "/watch/" + AVAILABLE_SLUG,
  ]) {
    // Served from the ISR cache. (Next omits Cache-Control on STALE responses
    // for on-demand paths, so assert on the cache marker instead.)
    await request.get(path);
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(["HIT", "STALE"], path).toContain(response.headers()["x-nextjs-cache"]);
    expect(response.headers()["cache-control"] ?? "", path).not.toContain("no-store");
  }

  for (const path of [
    "/latest?sort=views",
    "/hot?window=week",
    "/tag/gym?duration=5-15",
    "/search?q=gym",
    "/admin/login",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["cache-control"], path).toContain("no-store");
    expect(response.headers()["x-nextjs-cache"], path).toBeUndefined();
  }

  const api = await request.get("/api/list?path=/latest&page=2");
  expect(api.headers()["cache-control"] ?? "").not.toMatch(/s-maxage/);
});

test("?page=n renders that page, and internal routes redirect to it", async ({
  request,
}) => {
  const page2 = await (await request.get("/latest?page=2")).text();
  expect(page2).toContain("Latest Videos – Page 2");
  expect(page2).toMatch(/aria-current="page"[^>]*href="\/latest\?page=2"/);

  const filtered = await (await request.get("/latest?sort=views")).text();
  expect(filtered).toContain("noindex");

  for (const [internal, publicUrl] of [
    ["/latest/p/2", "/latest?page=2"],
    ["/tag/gym/p/3", "/tag/gym?page=3"],
    ["/latest/filter?sort=views", "/latest?sort=views"],
  ]) {
    const response = await request.get(internal, { maxRedirects: 0 });
    expect(response.status(), internal).toBe(308);
    const location = new URL(response.headers().location, "http://localhost");
    expect(location.pathname + location.search, internal).toBe(publicUrl);
  }
});
