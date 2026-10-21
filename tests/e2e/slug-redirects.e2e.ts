import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import { loginAdmin } from "./helpers";

test.describe.configure({ mode: "serial", retries: 0 });

const prisma = new PrismaClient();
const PREFIX = "e2e-slug-";
const VIDEO = `${PREFIX}video`;
const OTHER = `${PREFIX}other`;
// What the old rule made of the title: đ dropped.
const OLD_SLUG = `${PREFIX}tran-uc`;
const TITLE = "E2E Slug Trần Đức";
const NEW_SLUG = "e2e-slug-tran-duc";

async function cleanUp() {
  await prisma.slugRedirect.deleteMany({ where: { videoId: { startsWith: PREFIX } } });
  await prisma.mirror.deleteMany({ where: { videoId: { startsWith: PREFIX } } });
  await prisma.video.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.tag.deleteMany({ where: { slug: { in: ["da-nang-e2e", "a-nang-e2e"] } } });
}

async function createVideo(id: string, slug: string, title: string) {
  await prisma.video.create({
    data: {
      id,
      slug,
      title,
      status: "AVAILABLE",
      isPublished: true,
      isHidden: false,
      publishedAt: new Date("2001-01-01T00:00:00Z"),
      thumbnailPath: "/brand/logo-mark.svg",
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
  await createVideo(VIDEO, OLD_SLUG, TITLE);
  await createVideo(OTHER, `${PREFIX}other-video`, "E2E Slug Other");
});

test.afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

async function setSlug(page: Page, id: string, slug: string) {
  await page.goto(`/admin/videos/${id}`);
  await page.locator(`input[name="slug"]`).fill(slug);
  await page.getByRole("button", { name: "Save video" }).click();
}

test("renaming a published video's slug 301s the old URL to the new one", async ({
  page,
  request,
}) => {
  // Warm the ISR cache for the old URL first.
  expect((await request.get(`/watch/${OLD_SLUG}`)).status()).toBe(200);

  await loginAdmin(page);
  // An empty slug field means "from the title", with đ kept as d.
  await setSlug(page, VIDEO, "");
  await expect
    .poll(async () => (await prisma.video.findUnique({ where: { id: VIDEO } }))?.slug)
    .toBe(NEW_SLUG);

  const old = await request.get(`/watch/${OLD_SLUG}?utm_source=share`, { maxRedirects: 0 });
  expect(old.status()).toBe(301);
  const location = new URL(old.headers().location, "http://localhost");
  expect(location.pathname).toBe(`/watch/${NEW_SLUG}`);
  expect(location.search).toBe("?utm_source=share");

  const fresh = await request.get(`/watch/${NEW_SLUG}`, {
    headers: { "user-agent": "Twitterbot/1.0" },
  });
  expect(fresh.status()).toBe(200);
  const html = await fresh.text();
  expect(html).toMatch(new RegExp(`<link rel="canonical" href="[^"]*/watch/${NEW_SLUG}"`));

  const sitemap = await (await request.get("/sitemaps/videos/1.xml")).text();
  expect(sitemap).toContain(`/watch/${NEW_SLUG}<`);
  expect(sitemap).not.toContain(`/watch/${OLD_SLUG}<`);
});

test("another video cannot take a slug that redirects", async ({ page }) => {
  await loginAdmin(page);
  const action = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes(OTHER),
  );
  await setSlug(page, OTHER, OLD_SLUG);
  await action;
  // The action threw "Slug already exists" (the admin video page has no
  // inline error UI); what matters is that nothing changed.
  expect((await prisma.video.findUnique({ where: { id: OTHER } }))?.slug).toBe(
    `${PREFIX}other-video`,
  );
});

test("going back to an old slug drops its redirect and redirects the other way", async ({
  page,
  request,
}) => {
  await loginAdmin(page);
  await setSlug(page, VIDEO, OLD_SLUG);
  await expect
    .poll(async () => (await prisma.video.findUnique({ where: { id: VIDEO } }))?.slug)
    .toBe(OLD_SLUG);

  expect((await request.get(`/watch/${OLD_SLUG}`, { maxRedirects: 0 })).status()).toBe(200);
  const back = await request.get(`/watch/${NEW_SLUG}`, { maxRedirects: 0 });
  expect(back.status()).toBe(301);
  expect(new URL(back.headers().location, "http://localhost").pathname).toBe(
    `/watch/${OLD_SLUG}`,
  );
  expect(await prisma.slugRedirect.findMany({ where: { videoId: VIDEO } })).toEqual([
    expect.objectContaining({ slug: NEW_SLUG }),
  ]);
});

test("a tag created without a slug gets one that keeps đ", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/tags");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create tag" }) });
  await form.getByLabel("Name").fill("Đà Nẵng E2E");
  await form.getByRole("button", { name: "Create tag" }).click();
  await expect
    .poll(async () => (await prisma.tag.findFirst({ where: { name: "Đà Nẵng E2E" } }))?.slug)
    .toBe("da-nang-e2e");
});
