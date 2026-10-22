import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial", retries: 0 });

const prisma = new PrismaClient();
const PREFIX = "e2e-title-";
const PUBLISHED = `${PREFIX}published`;
const MANUAL = `${PREFIX}manual`;
const TAG = `${PREFIX}tag`;
const ESCAPED = "E2E Title Tiến &#40;anh điện lạnh&#41;";
const CLEAN = "E2E Title Tiến (anh điện lạnh)";
// What slugify made of the escaped title.
const OLD_SLUG = "e2e-title-tien-40-anh-dien-lanh-41";
const NEW_SLUG = "e2e-title-tien-anh-dien-lanh";

async function cleanUp() {
  await prisma.slugRedirect.deleteMany({ where: { videoId: { startsWith: PREFIX } } });
  await prisma.mirror.deleteMany({ where: { videoId: { startsWith: PREFIX } } });
  await prisma.video.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.tag.deleteMany({ where: { id: TAG } });
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

function cli(...args: string[]): string {
  return execFileSync("npx", ["tsx", "worker/cli.ts", "titles:decode", ...args], {
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
  });
}

const video = (id: string) =>
  prisma.video.findUnique({ where: { id }, select: { title: true, slug: true } });

test.beforeAll(async () => {
  await cleanUp();
  await createVideo(PUBLISHED, OLD_SLUG, ESCAPED);
  // Escaped title, but an admin picked this slug: the slug stays.
  await createVideo(MANUAL, `${PREFIX}hand-picked`, "E2E Title Ruby &amp; Co");
  await prisma.tag.create({ data: { id: TAG, slug: TAG, name: "Đồng hồ &amp; đá banh" } });
});

test.afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

test("dry run lists the fixes and changes nothing", async () => {
  const out = cli("--reslug");
  expect(out).toContain(`${OLD_SLUG} -> ${NEW_SLUG} (301)\t${ESCAPED}\t${CLEAN}`);
  expect(out).toContain("-\tE2E Title Ruby &amp; Co\tE2E Title Ruby & Co");
  expect(out).toContain("Đồng hồ &amp; đá banh\tĐồng hồ & đá banh");
  expect(out).toMatch(/would fix videos=2 \(slugs=1\) tags=1/);

  expect(await video(PUBLISHED)).toEqual({ title: ESCAPED, slug: OLD_SLUG });
});

test("apply with reslug fixes titles, tag names and generated slugs, keeping a 301", async ({
  request,
}) => {
  // Warm the ISR cache for the old URL first.
  expect((await request.get(`/watch/${OLD_SLUG}`)).status()).toBe(200);

  const out = cli("--reslug", "--apply");
  expect(out).toMatch(/fixed=3 of videos=2 \(slugs=1\) tags=1 categories=0, skipped=0/);

  expect(await video(PUBLISHED)).toEqual({ title: CLEAN, slug: NEW_SLUG });
  expect(await video(MANUAL)).toEqual({
    title: "E2E Title Ruby & Co",
    slug: `${PREFIX}hand-picked`,
  });
  expect((await prisma.tag.findUnique({ where: { id: TAG } }))?.name).toBe(
    "Đồng hồ & đá banh",
  );

  const old = await request.get(`/watch/${OLD_SLUG}`, { maxRedirects: 0 });
  expect(old.status()).toBe(301);
  expect(new URL(old.headers().location, "http://localhost").pathname).toBe(`/watch/${NEW_SLUG}`);

  const page = await request.get(`/watch/${NEW_SLUG}`, {
    headers: { "user-agent": "Twitterbot/1.0" },
  });
  expect(page.status()).toBe(200);
  const html = await page.text();
  expect(html).toContain("E2E Title Tiến (anh điện lạnh)");
  expect(html).not.toContain("&amp;#40;");

  // Nothing left: a second run is a no-op.
  expect(cli("--reslug", "--apply")).toMatch(/fixed=0 of videos=0/);
});
