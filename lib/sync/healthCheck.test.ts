import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { HostFileDTO, HostProvider } from "../hosts/types";
import { MISSING_RUNS_TO_REMOVE, runHealthCheck, shouldMarkRemoved, shouldRestore } from "./healthCheck";
import { applyHealthRestore, planHealthRestore } from "./restoreHealthRemoved";

describe("health behavior", () => {
  const ok = { status: "OK", missingStreak: 0 };
  const missingOnce = { status: "MISSING", missingStreak: 1 };
  const missingTwice = { status: "MISSING", missingStreak: MISSING_RUNS_TO_REMOVE };
  const error = { status: "ERROR", missingStreak: 0 };

  it("keeps a video available while at least one mirror is OK", () => {
    expect(shouldMarkRemoved([ok])).toBe(false);
    expect(shouldMarkRemoved([missingTwice, ok])).toBe(false);
  });

  it("removes only after every mirror was missing two runs in a row", () => {
    expect(shouldMarkRemoved([missingOnce])).toBe(false);
    expect(shouldMarkRemoved([missingTwice])).toBe(true);
    expect(shouldMarkRemoved([missingTwice, missingTwice])).toBe(true);
    expect(shouldMarkRemoved([])).toBe(false);
  });

  it("an API error never counts as a missing file", () => {
    expect(shouldMarkRemoved([error])).toBe(false);
    expect(shouldMarkRemoved([missingTwice, error])).toBe(false);
  });

  it("restores only its own removals", () => {
    expect(shouldRestore({ status: "REMOVED", removedBy: "health" }, [ok])).toBe(true);
    expect(shouldRestore({ status: "REMOVED", removedBy: "health" }, [missingTwice])).toBe(false);
    expect(shouldRestore({ status: "REMOVED", removedBy: "admin" }, [ok])).toBe(false);
    expect(shouldRestore({ status: "REMOVED", removedBy: null }, [ok])).toBe(false);
    expect(shouldRestore({ status: "BLOCKED", removedBy: "health" }, [ok])).toBe(false);
  });
});

const databaseUrl = process.env.DATABASE_URL;
const PREFIX = "e2e-health-";

/** A Dood stand-in: `answers` maps file codes to OK / MISSING / ERROR. */
function fakeProvider(answers: Map<string, "OK" | "MISSING" | "ERROR">): (hostId: string) => HostProvider {
  const provider: HostProvider = {
    id: "dood",
    label: "Dood",
    embedDomains: [],
    listFiles: async () => ({ files: [], hasMore: false }),
    async getFileInfo(code): Promise<HostFileDTO | null> {
      const answer = answers.get(code) ?? "OK";
      if (answer === "ERROR") throw new Error("429 Too Many Requests");
      if (answer === "MISSING") return null;
      return { code, title: code, lengthSeconds: 600, thumbnailUrl: null, uploadedAt: null };
    },
    embedUrl: (code) => `https://example.test/e/${code}`,
  };
  return () => provider;
}

describe.skipIf(!databaseUrl)("health check and restore (database)", () => {
  const prisma = new PrismaClient();
  const answers = new Map<string, "OK" | "MISSING" | "ERROR">();
  let videoId = "";

  async function cleanUp() {
    const videos = await prisma.video.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true } });
    const ids = videos.map((video) => video.id);
    await prisma.report.deleteMany({ where: { videoId: { in: ids } } });
    await prisma.adminAction.deleteMany({ where: { target: { in: ids } } });
    await prisma.mirror.deleteMany({ where: { videoId: { in: ids } } });
    await prisma.video.deleteMany({ where: { id: { in: ids } } });
  }

  async function video(slug: string, data: { status?: "AVAILABLE" | "REMOVED"; removedBy?: string | null } = {}) {
    const created = await prisma.video.create({
      data: {
        slug: `${PREFIX}${slug}`,
        title: slug,
        status: data.status ?? "AVAILABLE",
        removedBy: data.removedBy ?? null,
        isPublished: true,
        publishedAt: new Date(),
        mirrors: {
          create: {
            hostId: "dood",
            fileCode: `${PREFIX}${slug}`,
            rawTitle: slug,
            normalizedName: slug,
            embedUrl: "https://example.test/e/x",
            status: "OK",
            matchedBy: "PRIMARY",
          },
        },
      },
    });
    return created.id;
  }

  const check = (ids: string[]) => runHealthCheck({ videoIds: ids, provider: fakeProvider(answers) });
  const status = async (id: string) =>
    prisma.video.findUniqueOrThrow({ where: { id }, select: { status: true, removedBy: true } });

  beforeEach(async () => {
    answers.clear();
    await cleanUp();
    videoId = await video("one");
  });

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  it("an API error or a single 404 keeps the video; two 404s in a row remove it", async () => {
    const code = `${PREFIX}one`;
    answers.set(code, "ERROR");
    expect((await check([videoId])).skipped).toBe(false);
    expect(await status(videoId)).toEqual({ status: "AVAILABLE", removedBy: null });

    answers.set(code, "MISSING");
    await check([videoId]);
    expect(await status(videoId)).toEqual({ status: "AVAILABLE", removedBy: null });
    // An error between two 404s neither removes nor resets the count.
    answers.set(code, "ERROR");
    await check([videoId]);
    expect(await status(videoId)).toEqual({ status: "AVAILABLE", removedBy: null });
    answers.set(code, "MISSING");
    await check([videoId]);
    expect(await status(videoId)).toEqual({ status: "REMOVED", removedBy: "health" });

    // The file answers again: the health check undoes its own removal.
    answers.set(code, "OK");
    await check([videoId]);
    expect(await status(videoId)).toEqual({ status: "AVAILABLE", removedBy: null });
    expect((await prisma.mirror.findFirstOrThrow({ where: { videoId } })).missingStreak).toBe(0);
  });

  it("never restores an admin's removal or a legacy one", async () => {
    const byAdmin = await video("admin", { status: "REMOVED", removedBy: "admin" });
    const legacy = await video("legacy", { status: "REMOVED", removedBy: null });
    await check([byAdmin, legacy]);
    expect(await status(byAdmin)).toEqual({ status: "REMOVED", removedBy: "admin" });
    expect(await status(legacy)).toEqual({ status: "REMOVED", removedBy: null });
  });

  it("videos:restore-health restores legacy removals with a live file, skipping deliberate ones", async () => {
    const legacy = await video("legacy", { status: "REMOVED" });
    const gone = await video("gone", { status: "REMOVED" });
    answers.set(`${PREFIX}gone`, "MISSING");
    const reported = await video("reported", { status: "REMOVED" });
    await prisma.report.create({
      data: { videoId: reported, reason: "copyright", urgent: false, pageUrl: "/watch/x", status: "OPEN" },
    });
    const edited = await video("edited", { status: "REMOVED" });
    const admin = await prisma.adminUser.findFirst({ select: { id: true } });
    if (admin) await prisma.adminAction.create({ data: { adminId: admin.id, action: "VIDEO_UPDATE", target: edited } });
    const byAdmin = await video("by-admin", { status: "REMOVED", removedBy: "admin" });

    const plan = (await planHealthRestore({ provider: fakeProvider(answers) })).filter((row) =>
      row.slug.startsWith(PREFIX),
    );
    const bySlug = Object.fromEntries(plan.map((row) => [row.slug.slice(PREFIX.length), row]));
    expect(bySlug.legacy).toMatchObject({ skip: null, live: ["dood:OK"], mirrors: ["dood:OK"] });
    expect(bySlug.gone.skip).toContain("host không xác nhận");
    expect(bySlug.reported.skip).toContain("báo cáo");
    if (admin) expect(bySlug.edited.skip).toContain("VIDEO_UPDATE");
    expect(bySlug["by-admin"]).toBeUndefined();

    // Nothing changes until applied; then only the cleared rows.
    expect((await status(legacy)).status).toBe("REMOVED");
    expect(await applyHealthRestore(plan)).toBe(admin ? 1 : 2);
    expect((await status(legacy)).status).toBe("AVAILABLE");
    expect((await status(gone)).status).toBe("REMOVED");
    expect((await status(reported)).status).toBe("REMOVED");
    if (admin) expect((await status(edited)).status).toBe("REMOVED");
    expect((await status(byAdmin)).status).toBe("REMOVED");
  });
});
