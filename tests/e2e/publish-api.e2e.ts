import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial", retries: 0 });

const prisma = new PrismaClient();
const PREFIX = "e2e-api-";
const TITLE = "E2E API Trần Đức";
const SLUG = "e2e-api-tran-duc";
// Host files the sync already indexed. The E2E server has no host API keys,
// so the API falls back to these records (with a warning).
const FILES = {
  dood: `${PREFIX}dood-1`,
  voe: `${PREFIX}voe-1`,
  cli: `${PREFIX}dood-cli`,
};
// A 1x1 PNG.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const token = "gv_" + randomBytes(32).toString("base64url");
const revoked = "gv_" + randomBytes(32).toString("base64url");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const auth = (value = token) => ({ authorization: `Bearer ${value}` });

let createdId = "";

async function cleanUp() {
  const videos = await prisma.video.findMany({
    where: { slug: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = videos.map((video) => video.id);
  await prisma.hostFile.deleteMany({ where: { fileCode: { startsWith: PREFIX } } });
  await prisma.setting.deleteMany({ where: { OR: ids.map((id) => ({ key: { contains: id } })) } });
  await prisma.videoTag.deleteMany({ where: { videoId: { in: ids } } });
  await prisma.mirror.deleteMany({ where: { videoId: { in: ids } } });
  await prisma.adminAction.deleteMany({
    where: { OR: ids.map((id) => ({ target: { startsWith: id } })) },
  });
  await prisma.video.deleteMany({ where: { id: { in: ids } } });
  await prisma.tag.deleteMany({ where: { slug: "da-nang-e2e-api" } });
  await prisma.apiToken.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

test.beforeAll(async () => {
  await cleanUp();
  const admin = await prisma.adminUser.findFirstOrThrow({
    where: { email: "admin@gayvideo.test" },
  });
  await prisma.apiToken.createMany({
    data: [
      { name: `${PREFIX}colab`, tokenHash: sha256(token), adminId: admin.id },
      {
        name: `${PREFIX}old`,
        tokenHash: sha256(revoked),
        adminId: admin.id,
        revokedAt: new Date(),
      },
    ],
  });
  await prisma.hostFile.createMany({
    data: [
      { hostId: "dood", fileCode: FILES.dood, rawTitle: "e2e api.mp4", normalizedName: "e2e api" },
      { hostId: "voe", fileCode: FILES.voe, rawTitle: "e2e api.mp4", normalizedName: "e2e api" },
      { hostId: "dood", fileCode: FILES.cli, rawTitle: "e2e cli.mp4", normalizedName: "e2e cli" },
    ],
  });
});

test.afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

test("needs a valid, unrevoked token", async ({ request }) => {
  for (const headers of [{}, auth("gv_" + "x".repeat(43)), auth(revoked), { authorization: "Basic abc" }]) {
    const response = await request.get("/api/v1/meta", { headers });
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe("unauthorized");
  }

  const meta = await request.get("/api/v1/meta", { headers: auth() });
  expect(meta.status()).toBe(200);
  const body = await meta.json();
  expect(body.token).toBe(`${PREFIX}colab`);
  expect(body.hosts.map((host: { id: string }) => host.id)).toEqual(
    expect.arrayContaining(["dood", "voe", "earnvids"]),
  );
  expect(body.categories.map((category: { slug: string }) => category.slug)).toContain("fitness");
});

test("creates a draft with mirrors, tags, category and an uploaded thumbnail", async ({
  request,
}) => {
  const response = await request.post("/api/v1/videos", {
    headers: auth(),
    data: {
      title: TITLE,
      mirrors: [
        { host: "dood", fileCode: FILES.dood },
        { host: "voe", fileCode: FILES.voe },
      ],
      tags: ["Đà Nẵng E2E API", "Gym"],
      categorySlug: "fitness",
      quality: "HD",
      thumbnailDataUrl: PNG,
    },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.created).toBe(true);
  expect(body.video).toMatchObject({ slug: SLUG, published: false, url: `/watch/${SLUG}` });
  expect(body.video.thumbnailPath).toMatch(/\.webp\?v=/);
  expect(body.warnings.join(" ")).toContain("used the synced record");
  createdId = body.video.id;

  const video = await prisma.video.findUniqueOrThrow({
    where: { id: createdId },
    include: { mirrors: true, videoTags: { include: { tag: true } }, category: true },
  });
  expect(video.isPublished).toBe(false);
  expect(video.quality).toBe("HD");
  expect(video.category?.slug).toBe("fitness");
  expect(video.mirrors.map((mirror) => mirror.hostId).sort()).toEqual(["dood", "voe"]);
  expect(video.videoTags.map(({ tag }) => tag.slug).sort()).toEqual(["da-nang-e2e-api", "gym"]);

  // A draft is not public yet.
  expect((await request.get(`/watch/${SLUG}`)).status()).toBe(404);

  const fetched = await request.get(`/api/v1/videos/${createdId}`, { headers: auth() });
  expect((await fetched.json()).video).toMatchObject({
    id: createdId,
    published: false,
    category: { slug: "fitness" },
  });
});

test("the same files update that draft and can publish it; then it is locked", async ({
  request,
}) => {
  const response = await request.post("/api/v1/videos", {
    headers: auth(),
    data: {
      title: TITLE,
      mirrors: [{ host: "dood", fileCode: FILES.dood }],
      description: "Posted from Colab",
      publish: true,
    },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ created: false, video: { id: createdId, published: true } });
  expect((await request.get(`/watch/${SLUG}`)).status()).toBe(200);

  const again = await request.post("/api/v1/videos", {
    headers: auth(),
    data: { title: "Overwrite", mirrors: [{ host: "dood", fileCode: FILES.dood }] },
  });
  expect(again.status()).toBe(409);
  expect((await again.json()).error).toMatchObject({
    code: "already_published",
    video: { id: createdId },
  });
  expect((await prisma.video.findUniqueOrThrow({ where: { id: createdId } })).title).toBe(TITLE);
});

test("explains what is wrong with a request", async ({ request }) => {
  const cases: [unknown, number, string][] = [
    [{ title: "x" }, 422, "invalid_input"],
    [{ title: "x", mirrors: [{ host: "dood", fileCode: "a" }], extra: 1 }, 422, "invalid_input"],
    [{ title: "x", mirrors: [{ host: "youtube", fileCode: "a" }] }, 422, "unknown_host"],
    [
      { title: "x", mirrors: [{ host: "dood", fileCode: "a" }, { host: "dood", fileCode: "b" }] },
      422,
      "duplicate_host",
    ],
    [
      { title: "x", mirrors: [{ host: "dood", fileCode: FILES.cli }], categorySlug: "nope" },
      422,
      "unknown_category",
    ],
    // Not indexed and the host API is unreachable here: refused, not guessed.
    [{ title: "x", mirrors: [{ host: "dood", fileCode: `${PREFIX}unknown` }] }, 502, "host_unavailable"],
  ];
  for (const [data, status, code] of cases) {
    const response = await request.post("/api/v1/videos", { headers: auth(), data });
    expect(response.status(), code).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  }

  const notJson = await request.post("/api/v1/videos", {
    headers: { ...auth(), "content-type": "application/json" },
    data: Buffer.from("{nope"),
  });
  expect(notJson.status()).toBe(400);
  expect(await prisma.video.count({ where: { title: "x" } })).toBe(0);
});

test("the Python client publishes from the command line", () => {
  const out = execFileSync(
    "python3",
    [
      "scripts/publish-client/gayvideo_publish.py",
      "--title",
      "E2E API Python Đỗ",
      "--mirror",
      `dood:${FILES.cli}`,
      "--tag",
      "Gym",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, GAYVIDEO_API_TOKEN: token, GAYVIDEO_API_URL: "http://localhost:3000" },
    },
  );
  expect(out).toContain("Created: http://localhost:3000/watch/e2e-api-python-do");
  expect(out).toContain("draft");
});
