import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  acknowledgePlayerDomains,
  CSP_ACK_SETTING,
  CSP_REPORTS_SETTING,
  CSP_SEEN_SETTING,
  listCspReports,
  newPlayerDomains,
  parseCspReports,
  pruneCspReports,
  recordCspReports,
} from "./cspReports";

describe("parseCspReports", () => {
  it("reads report-uri reports and keeps only the hostname", () => {
    const reports = parseCspReports({
      "csp-report": {
        "document-uri": "https://gayvideo.fun/watch/68267-watermarked?t=1",
        "effective-directive": "frame-src",
        "blocked-uri": "https://d000d.com/e/secretcode123?token=abc",
        disposition: "enforce",
      },
    });
    expect(reports).toEqual([
      { directive: "frame-src", blocked: "d000d.com", disposition: "enforce", page: "/watch/68267-watermarked" },
    ]);
  });

  it("reads report-to batches, report-only ones included, and ignores junk", () => {
    const reports = parseCspReports([
      {
        type: "csp-violation",
        body: {
          documentURL: "https://gayvideo.fun/watch/a",
          effectiveDirective: "frame-src",
          blockedURL: "https://jennifercertaindevelopment.com/e/x",
          disposition: "report",
        },
      },
      { type: "deprecation", body: { id: "x" } },
      { type: "csp-violation", body: { effectiveDirective: "script-src-elem", blockedURL: "inline" } },
      { type: "csp-violation", body: { effectiveDirective: "frame-src", blockedURL: "<script>" } },
    ]);
    expect(reports).toEqual([
      { directive: "frame-src", blocked: "jennifercertaindevelopment.com", disposition: "report", page: "/watch/a" },
      { directive: "script-src-elem", blocked: "inline", disposition: "enforce", page: "" },
    ]);
    expect(parseCspReports("nope")).toEqual([]);
    expect(parseCspReports({ other: 1 })).toEqual([]);
  });
});

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("recordCspReports (database)", () => {
  const prisma = new PrismaClient();
  const keys = [CSP_REPORTS_SETTING, CSP_SEEN_SETTING, CSP_ACK_SETTING];
  beforeEach(() => prisma.setting.deleteMany({ where: { key: { in: keys } } }));
  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: { in: keys } } });
    await prisma.$disconnect();
  });

  it("counts reports per host and directive, newest first", async () => {
    const frame = { directive: "frame-src", blocked: "d000d.com", disposition: "report" as const, page: "/watch/a" };
    await recordCspReports([frame], new Date("2026-11-26T10:00:00Z"), prisma);
    await recordCspReports([frame, { ...frame, blocked: "voe-rotated.com" }], new Date("2026-11-26T11:00:00Z"), prisma);
    const list = await listCspReports(prisma);
    expect(list.map((entry) => [entry.blocked, entry.count])).toEqual([
      ["d000d.com", 2],
      ["voe-rotated.com", 1],
    ]);
    expect(list[0]).toMatchObject({ firstAt: "2026-11-26T10:00:00.000Z", lastAt: "2026-11-26T11:00:00.000Z" });
  });

  it("alerts on a player domain never seen before, until 'Đã xem'; only once per domain", async () => {
    const frame = { directive: "frame-src", blocked: "d000d.com", disposition: "report" as const, page: "/watch/a" };
    await recordCspReports([frame, { ...frame, directive: "img-src", blocked: "img.example" }], new Date("2026-11-26T10:00:00Z"), prisma);
    expect(await newPlayerDomains(prisma)).toEqual([{ host: "d000d.com", firstSeenAt: "2026-11-26T10:00:00.000Z" }]);

    await acknowledgePlayerDomains(new Date("2026-11-26T12:00:00Z"), prisma);
    expect(await newPlayerDomains(prisma)).toEqual([]);
    // Seen again: no new alert. A different domain: alert again.
    await recordCspReports([frame, { ...frame, blocked: "voe-new.com" }], new Date("2026-11-26T13:00:00Z"), prisma);
    expect((await newPlayerDomains(prisma)).map((domain) => domain.host)).toEqual(["voe-new.com"]);

    // Pruned after 30 days without reports, but still known: no alert later.
    await acknowledgePlayerDomains(new Date("2026-11-26T14:00:00Z"), prisma);
    expect(await pruneCspReports(new Date("2026-12-27T00:00:00Z"), prisma)).toBe(3);
    expect(await listCspReports(prisma)).toEqual([]);
    await recordCspReports([frame], new Date("2027-01-02T00:00:00Z"), prisma);
    expect(await newPlayerDomains(prisma)).toEqual([]);
    expect(await pruneCspReports(new Date("2027-01-03T00:00:00Z"), prisma)).toBe(0);
  });
});
