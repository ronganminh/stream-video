import { expect, test } from "@playwright/test";

import { AVAILABLE_SLUG } from "./helpers";

test("sitemap index lists paginated video sitemaps with video extensions", async ({
  request,
}) => {
  const index = await (await request.get("/sitemap.xml")).text();
  expect(index).toContain("<sitemapindex");
  const videoSitemap = index.match(/<loc>[^<]*(\/sitemaps\/videos\/1\.xml)<\/loc>/)?.[1];
  expect(videoSitemap).toBe("/sitemaps/videos/1.xml");

  const response = await request.get("/sitemaps/videos/1.xml");
  expect(response.headers()["content-type"]).toContain("application/xml");
  const xml = await response.text();
  expect(xml).toContain('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"');
  expect(xml).toContain(`/watch/${AVAILABLE_SLUG}</loc>`);
  expect(xml).toMatch(/<video:thumbnail_loc>https?:\/\/[^<]+<\/video:thumbnail_loc>/);
  expect(xml).toMatch(/<video:player_loc>https?:\/\/[^<]+<\/video:player_loc>/);
  expect(xml).toContain("<video:family_friendly>no</video:family_friendly>");

  expect((await request.get("/sitemaps/videos/99.xml")).status()).toBe(404);
  const legacy = await request.get("/sitemaps/videos.xml", { maxRedirects: 0 });
  expect(legacy.status()).toBe(301);
});

test("watch pages carry VideoObject and BreadcrumbList JSON-LD", async ({ request }) => {
  const html = await (await request.get(`/watch/${AVAILABLE_SLUG}`)).text();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)]
    .flatMap((match) => [JSON.parse(match[1])].flat());

  const video = blocks.find((block) => block["@type"] === "VideoObject");
  expect(video).toMatchObject({
    name: "Morning Gym Session with Marco",
    url: expect.stringMatching(new RegExp(`/watch/${AVAILABLE_SLUG}$`)),
    uploadDate: expect.any(String),
    duration: expect.stringMatching(/^PT/),
    isFamilyFriendly: false,
  });
  expect(video.thumbnailUrl[0]).toMatch(/^https?:\/\//);
  expect(video.embedUrl).toMatch(/^https?:\/\//);

  const breadcrumbs = blocks.find((block) => block["@type"] === "BreadcrumbList");
  expect(breadcrumbs.itemListElement.at(-1).item).toMatch(new RegExp(`/watch/${AVAILABLE_SLUG}$`));
});

test("list pages have share metadata, canonical and pagination-aware robots", async ({
  request,
}) => {
  // Next streams metadata into the body for browsers and JS-running crawlers
  // (Googlebot), but puts it in <head> for link-preview bots like Twitterbot,
  // which can't run JS; that is the strictest case, so check it.
  const meta = async (path: string) => {
    const response = await request.get(path, {
      headers: { "user-agent": "Twitterbot/1.0" },
    });
    const head = (await response.text()).split("</head>")[0];
    const get = (pattern: RegExp) => head.match(pattern)?.[1];
    return {
      canonical: get(/<link rel="canonical" href="([^"]+)"/),
      description: get(/<meta name="description" content="([^"]+)"/),
      robots: get(/<meta name="robots" content="([^"]+)"/),
      ogUrl: get(/<meta property="og:url" content="([^"]+)"/),
      card: get(/<meta name="twitter:card" content="([^"]+)"/),
    };
  };

  const tag = await meta("/tag/gym");
  expect(tag.canonical).toMatch(/\/tag\/gym$/);
  expect(tag.ogUrl).toBe(tag.canonical);
  expect(tag.description).toContain("#Gym");
  expect(tag.card).toBe("summary_large_image");

  // (The seeded categories and tags fit on one page; their page 2 is a 404.)
  const page2 = await meta("/latest?page=2");
  expect(page2.canonical).toMatch(/\/latest\?page=2$/);
  expect(page2.robots).toBe("index, follow");
  expect(page2.description).toContain("page 2");

  const filtered = await meta("/latest?sort=views&page=2");
  expect(filtered.canonical).toMatch(/\/latest$/);
  expect(filtered.robots).toBe("noindex, follow");

  for (const path of ["/hot", "/most-viewed", "/categories"]) {
    const page = await meta(path);
    expect(page.description, path).toBeTruthy();
    expect(page.ogUrl, path).toBe(page.canonical);
  }
});
