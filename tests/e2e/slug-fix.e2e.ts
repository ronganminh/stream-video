import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial", retries: 0 });

const prisma = new PrismaClient();
const PREFIX = "e2e-fix-";
const DRAFT = `${PREFIX}draft`;
const PUBLISHED = `${PREFIX}published`;
const BLOCKER = `${PREFIX}blocker`;
const MANUAL = `${PREFIX}manual`;
const IDS = [DRAFT, PUBLISHED, BLOCKER, MANUAL].join(",");

async function cleanUp() {
  await prisma.slugRedirect.deleteMany({ where: { videoId: { startsWith: PREFIX } } });
  await prisma.mirror.deleteMany({ where: { videoId: { startsWith: PREFIX } } });
  await prisma.video.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

async function createVideo(id: string, slug: string, title: string, published: boolean) {
  await prisma.video.create({
    data: {
      id,
      slug,
      title,
      status: "AVAILABLE",
      isPublished: published,
      isHidden: false,
      publishedAt: published ? new Date("2001-01-01T00:00:00Z") : null,
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

// The real CLI, as the deploy workflow runs it (scoped to this test's videos).
function cli(...args: string[]): string {
  return execFileSync("npx", ["tsx", "worker/cli.ts", "slugs:fix-d", `--ids=${IDS}`, ...args], {
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
  });
}

const slugOf = async (id: string) =>
  (await prisma.video.findUnique({ where: { id }, select: { slug: true } }))?.slug;

test.beforeAll(async () => {
  await cleanUp();
  // Legacy slugs: the old rule dropped đ.
  await createVideo(DRAFT, "e2e-fix-draft-tran-uc", "E2E Fix Draft Trần Đức", false);
  await createVideo(PUBLISHED, "e2e-fix-pub-tran-uc", "E2E Fix Pub Trần Đức", true);
  // Already holds the published video's proposed slug.
  await createVideo(BLOCKER, "e2e-fix-pub-tran-duc", "E2E Fix Blocker", true);
  // An admin chose this slug by hand: never touched.
  await createVideo(MANUAL, "e2e-fix-hand-picked", "E2E Fix Đỗ Manual", true);
});

test.afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

test("dry run lists the renames and changes nothing", async () => {
  const out = cli("--scope=all");
  expect(out).toContain("e2e-fix-draft-tran-uc\te2e-fix-draft-tran-duc\t");
  expect(out).toContain("e2e-fix-pub-tran-uc\te2e-fix-pub-tran-duc-2 (suffixed)\t");
  expect(out).not.toContain("e2e-fix-hand-picked");
  expect(out).toContain("would rename 2 videos, 1 with a 301");

  expect(await slugOf(DRAFT)).toBe("e2e-fix-draft-tran-uc");
  expect(await slugOf(PUBLISHED)).toBe("e2e-fix-pub-tran-uc");
  expect(await prisma.slugRedirect.count({ where: { videoId: { startsWith: PREFIX } } })).toBe(0);
});

test("apply with the default scope renames drafts only, without redirects", async () => {
  const out = cli("--apply");
  expect(out).toContain("renamed=1 redirects=0 skipped=0");
  expect(await slugOf(DRAFT)).toBe("e2e-fix-draft-tran-duc");
  expect(await slugOf(PUBLISHED)).toBe("e2e-fix-pub-tran-uc");
  expect(await prisma.slugRedirect.count({ where: { videoId: DRAFT } })).toBe(0);
});

test("apply on published videos keeps a 301 from the old slug", async ({ request }) => {
  // Warm the ISR cache for the old URL first.
  expect((await request.get("/watch/e2e-fix-pub-tran-uc")).status()).toBe(200);

  const out = cli("--scope=published", "--apply");
  expect(out).toContain("renamed=1 redirects=1 skipped=0");
  expect(await slugOf(PUBLISHED)).toBe("e2e-fix-pub-tran-duc-2");
  expect(await slugOf(BLOCKER)).toBe("e2e-fix-pub-tran-duc");
  expect(await slugOf(MANUAL)).toBe("e2e-fix-hand-picked");

  const old = await request.get("/watch/e2e-fix-pub-tran-uc", { maxRedirects: 0 });
  expect(old.status()).toBe(301);
  expect(new URL(old.headers().location, "http://localhost").pathname).toBe(
    "/watch/e2e-fix-pub-tran-duc-2",
  );
  expect((await request.get("/watch/e2e-fix-pub-tran-duc-2")).status()).toBe(200);

  // Nothing left to fix: a second run is a no-op.
  expect(cli("--scope=all", "--apply")).toContain("renamed=0 redirects=0 skipped=0");
});
