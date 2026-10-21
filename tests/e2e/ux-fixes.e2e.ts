import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import { addAgeCookie, AVAILABLE_SLUG } from "./helpers";

test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
const PREFIX = "e2e-ux-";
const VIETNAMESE = `${PREFIX}bevis-tran-duc-vuong`;
const TAG_MATCH = `${PREFIX}ladyboy-night`;
const EMPTY_CATEGORY = `${PREFIX}empty-category`;

async function cleanUp() {
  const videoWhere = { videoId: { startsWith: PREFIX } };
  await prisma.videoTag.deleteMany({ where: videoWhere });
  await prisma.mirror.deleteMany({ where: videoWhere });
  await prisma.video.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.tag.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

async function createVideo(id: string, title: string) {
  await prisma.video.create({
    data: {
      id,
      slug: id,
      title,
      status: "AVAILABLE",
      isPublished: true,
      isHidden: false,
      // Old, so it stays off the first pages other tests look at.
      publishedAt: new Date("2001-01-01T00:00:00Z"),
      thumbnailPath: "/brand/logo-mark.svg",
      categoryId: null,
      mirrors: {
        create: {
          hostId: "voe",
          fileCode: `${id}-voe`,
          rawTitle: `${id}.mp4`,
          normalizedName: id,
          embedUrl: `https://example.invalid/e/${id}`,
          status: "OK",
          matchedBy: "PRIMARY",
        },
      },
    },
  });
}

test.beforeAll(async () => {
  await cleanUp();
  await createVideo(VIETNAMESE, "Bevis Trần Đức Vương");
  await createVideo(TAG_MATCH, "Ladyboy Night");
  await prisma.tag.create({
    data: {
      id: `${PREFIX}transgender`,
      slug: `${PREFIX}transgender`,
      name: "Transgender",
      videoTags: { create: { videoId: TAG_MATCH } },
    },
  });
  // Exists, but has no videos: it has no page.
  await prisma.category.create({
    data: {
      id: EMPTY_CATEGORY,
      slug: EMPTY_CATEGORY,
      name: "Empty E2E",
      group: "Body",
      trending: true,
      sortOrder: -1,
    },
  });
});

test.afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

test("missing watch, tag and category pages answer a real 404", async ({ request }) => {
  const missing = [
    "/watch/khong-ton-tai",
    "/tag/khong-ton-tai",
    "/category/khong-ton-tai",
    `/category/${EMPTY_CATEGORY}`,
    "/tag/khong-ton-tai?page=2",
    "/category/khong-ton-tai?sort=views",
  ];
  // Twice: the second answer comes from the ISR cache and must stay a 404.
  for (const round of [1, 2]) {
    for (const path of missing) {
      const response = await request.get(path);
      expect(response.status(), `${path} (request ${round})`).toBe(404);
      expect(await response.text()).toContain("Lost the video?");
    }
  }

  // Removed videos still say 410, and real pages are untouched.
  expect((await request.get("/watch/removed-example-video")).status()).toBe(410);
  for (const path of [`/watch/${AVAILABLE_SLUG}`, "/tag/gym", "/category/fitness"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test("list pages past the last one 404; bad page numbers fall back to page 1", async ({
  request,
}) => {
  for (const path of [
    "/latest?page=9999",
    "/hot?page=9999",
    "/most-viewed?page=9999",
    "/tag/gym?page=9999",
    "/category/fitness?page=9999",
    // Filtered listings render per request; same rule.
    "/latest?sort=views&page=9999",
    "/tag/gym?sort=views&page=9999",
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }

  for (const path of ["/latest?page=2", "/latest?page=abc", "/latest?page=-1"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }
  const fallback = await (await request.get("/latest?page=abc")).text();
  expect(fallback).not.toContain("Page abc");
});

async function resultOrder(page: Page, query: string) {
  await page.goto(`/search?q=${encodeURIComponent(query)}`);
  return page
    .locator('main a[href^="/watch/"]')
    .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute("href")))]);
}

test("search ignores Vietnamese accents and ranks title matches first", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);

  for (const query of ["tran", "Trần", "TRAN DUC", "đức vương", "duc vuong"]) {
    const order = await resultOrder(page, query);
    expect(order[0], query).toBe(`/watch/${VIETNAMESE}`);
  }

  // "tran" also matches the tag "Transgender", but a title match ranks first.
  const order = await resultOrder(page, "tran");
  expect(order).toContain(`/watch/${TAG_MATCH}`);
  expect(order.indexOf(`/watch/${VIETNAMESE}`)).toBeLessThan(
    order.indexOf(`/watch/${TAG_MATCH}`),
  );
});

test("the home page links nowhere dead and has one site-level h1", async ({
  page,
  context,
  request,
}) => {
  await addAgeCookie(context);
  await page.goto("/");

  const hrefs = await page
    .locator('a[href^="/"]')
    .evaluateAll((links) => [
      ...new Set(links.map((link) => link.getAttribute("href")!.split("#")[0])),
    ]);
  expect(hrefs.length).toBeGreaterThan(10);
  expect(hrefs).not.toContain(`/category/${EMPTY_CATEGORY}`);
  for (const href of hrefs) {
    const status = (await request.get(href, { maxRedirects: 0 })).status();
    expect(status, href).toBeLessThan(400);
  }

  // The quick nav's category link comes from the data. (Mobile only, so
  // hidden at this viewport: located by its label rather than its role.)
  const quickNav = page.locator('nav[aria-label="Home sections"]');
  const categoryLink = quickNav.locator('a[href^="/category/"]');
  await expect(categoryLink).toHaveCount(1);

  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveCount(1);
  await expect(h1).toContainText("GayVideo.fun");
  await expect(page.getByRole("heading", { level: 2, name: "Trending now" })).toBeVisible();
});

test("a watch page without a category skips that breadcrumb step", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);
  await page.goto(`/watch/${VIETNAMESE}`);

  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link")).toHaveText(["Home"]);
  await expect(crumbs).toContainText("Bevis Trần Đức Vương");
  await expect(page.locator('a[href="/category/uncategorized"]')).toHaveCount(0);

  const breadcrumbList = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((scripts) =>
      scripts
        .flatMap((script) => [JSON.parse(script.textContent ?? "null")].flat())
        .find((item) => item?.["@type"] === "BreadcrumbList"),
    );
  expect(breadcrumbList.itemListElement.map((item: { name: string }) => item.name)).toEqual([
    "Home",
    "Bevis Trần Đức Vương",
  ]);
});

test("Share uses the share sheet with title and URL, else copies with a toast", async ({
  page,
  context,
}) => {
  await addAgeCookie(context);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  // Without navigator.share (desktop Chromium on Linux): copy + toast.
  await page.goto(`/watch/${AVAILABLE_SLUG}`);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    new RegExp(`/watch/${AVAILABLE_SLUG}$`),
  );

  // With navigator.share: the sheet gets the title and the URL.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { __shared: ShareData }).__shared = data;
      },
    });
  });
  await page.getByRole("button", { name: "Share" }).click();
  const shared = await page.evaluate(
    () => (window as unknown as { __shared: ShareData }).__shared,
  );
  expect(shared.title).toBe("Morning Gym Session with Marco");
  expect(shared.url).toMatch(new RegExp(`/watch/${AVAILABLE_SLUG}$`));
});

test("server buttons name their host", async ({ page, context }) => {
  await addAgeCookie(context);
  await page.goto(`/watch/${AVAILABLE_SLUG}`);
  const servers = page.getByRole("group", { name: "Video servers" });
  const buttons = servers.getByRole("button");
  const labels = await buttons.allTextContents();
  expect(labels.length).toBeGreaterThan(1);
  for (const [index, label] of labels.entries()) {
    expect(label).not.toMatch(/^\d+$/);
    await expect(buttons.nth(index)).toHaveAccessibleName(
      `${label}, server ${index + 1} of ${labels.length}`,
    );
  }
});
