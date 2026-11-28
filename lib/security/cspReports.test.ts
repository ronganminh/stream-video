import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  acknowledgePlayerDomains,
  classifyDomain,
  cspSelfTest,
  CSP_LABELS_SETTING,
  labelCspDomain,
  likelyAdDomains,
  looksLikeAdDomain,
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

describe("ad domain signs", () => {
  it("flags the ad and gambling pages the Dood player opened on production", () => {
    for (const host of [
      "ww888new.com",
      "xml-v4.ezmob.com",
      "bef88win678.com",
      "www.bef88win678.com",
      "ad.playfun788.com",
      "lc.ribzubacrche.cfd",
      "jg.fritsimoons.cyou",
      "bc.cuculireactor.qpon",
      "ads.example.com",
      "my-casino.net",
    ]) {
      expect(looksLikeAdDomain(host), host).toBe(true);
    }
  });

  it("leaves player domains alone", () => {
    for (const host of ["d000d.com", "dood.yt", "ds2play.com", "do7go.com", "doply.net", "voe.sx", "morencius.com", "vidplay.online", "window.example.com", "padawan.org"]) {
      expect(looksLikeAdDomain(host), host).toBe(false);
    }
  });

  it("an admin's label wins over the signs", () => {
    expect(classifyDomain("werefilledwit.org", {})).toBe("unknown");
    expect(classifyDomain("werefilledwit.org", { "werefilledwit.org": { kind: "ad", at: "x" } })).toBe("ignored");
    expect(classifyDomain("ad.playfun788.com", { "ad.playfun788.com": { kind: "player", hostId: "dood", at: "x" } })).toBe("player");
    expect(classifyDomain("ad.playfun788.com", {})).toBe("likely-ad");
  });
});

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("recordCspReports (database)", () => {
  const prisma = new PrismaClient();
  const keys = [CSP_REPORTS_SETTING, CSP_SEEN_SETTING, CSP_ACK_SETTING, CSP_LABELS_SETTING];
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

  it("only unknown domains are red; likely ads apart; labelled ones never again", async () => {
    const frame = { directive: "frame-src", blocked: "werefilledwit.org", disposition: "report" as const, page: "/watch/a" };
    const at = new Date("2026-11-27T10:00:00Z");
    await recordCspReports(
      [frame, { ...frame, blocked: "ad.playfun788.com" }, { ...frame, blocked: "new-player.example" }],
      at,
      prisma,
    );
    expect((await newPlayerDomains(prisma)).map((d) => d.host).sort()).toEqual(["new-player.example", "werefilledwit.org"]);
    expect((await likelyAdDomains(prisma)).map((d) => d.host)).toEqual(["ad.playfun788.com"]);

    expect(await labelCspDomain("werefilledwit.org", { kind: "ad" }, at, prisma)).toBe(true);
    expect(await labelCspDomain("New-Player.example", { kind: "player", hostId: "dood" }, at, prisma)).toBe(true);
    expect(await labelCspDomain("ad.playfun788.com", { kind: "ad" }, at, prisma)).toBe(true);
    expect(await labelCspDomain("<script>", { kind: "ad" }, at, prisma)).toBe(false);
    expect(await newPlayerDomains(prisma)).toEqual([]);
    expect(await likelyAdDomains(prisma)).toEqual([]);
    // Reported again later: still quiet.
    await recordCspReports([frame], new Date("2026-11-28T10:00:00Z"), prisma);
    expect(await newPlayerDomains(prisma)).toEqual([]);
  });

  it("csp:selftest raises the alert for a test host and leaves no trace", async () => {
    const real = { directive: "frame-src", blocked: "d000d.com", disposition: "report" as const, page: "/watch/a" };
    await recordCspReports([real], new Date("2026-11-26T10:00:00Z"), prisma);
    expect(await cspSelfTest(new Date("2026-11-26T11:00:00Z"), prisma)).toBe(true);
    expect((await listCspReports(prisma)).map((entry) => entry.blocked)).toEqual(["d000d.com"]);
    expect((await newPlayerDomains(prisma)).map((domain) => domain.host)).toEqual(["d000d.com"]);
  });
});
