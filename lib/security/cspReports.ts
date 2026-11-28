import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";

// CSP violation reports from visitors' browsers (Caddyfile: report-to csp,
// report-uri /api/csp-report). Hosts rotate their player domains (Dood, VOE);
// the report-only policy keeps the known list, so a new player domain shows
// up here before anyone has to describe it. Only the blocked hostname, the
// directive and our page path are kept: never full URLs (they can carry file
// codes or tokens), never IPs.

export const CSP_REPORTS_SETTING = "security.cspBlocked";
/** Every player (frame-src) domain ever reported: { host: firstSeenAt }. Never pruned. */
export const CSP_SEEN_SETTING = "security.cspSeenFrameHosts";
/** When an admin last pressed "Đã xem": domains first seen after it are new. */
export const CSP_ACK_SETTING = "security.cspAckAt";
/** What an admin said a reported frame domain is: { host: { kind, hostId?, at } }. */
export const CSP_LABELS_SETTING = "security.cspDomainLabels";
const MAX_ENTRIES = 200;
const MAX_SEEN = 2000;
export const CSP_RETENTION_DAYS = 30;

export type CspReport = {
  directive: string;
  /** Hostname of the blocked resource, or a keyword (inline, eval, data…). */
  blocked: string;
  /** "enforce" (really blocked) or "report" (report-only policy). */
  disposition: "enforce" | "report";
  /** Path of our page, without query. */
  page: string;
};

export type CspEntry = {
  directive: string;
  blocked: string;
  disposition: "enforce" | "report";
  count: number;
  firstAt: string;
  lastAt: string;
  page: string;
};

function hostOf(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "wss:") return url.hostname.toLowerCase();
    return url.protocol.replace(":", "");
  } catch {
    // Keywords such as "inline", "eval", "self".
    return /^[a-z-]{1,20}$/i.test(text) ? text.toLowerCase() : "";
  }
}

function pathOf(value: unknown): string {
  try {
    return new URL(String(value)).pathname.slice(0, 120);
  } catch {
    return "";
  }
}

function directiveOf(value: unknown): string {
  const text = String(value ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return /^[a-z-]{1,40}$/.test(text) ? text : "";
}

/**
 * Reads both formats: `application/csp-report` ({"csp-report": {...}}, from
 * report-uri) and `application/reports+json` ([{type, body}], from report-to).
 */
export function parseCspReports(payload: unknown): CspReport[] {
  const raw: Record<string, unknown>[] = [];
  if (Array.isArray(payload)) {
    for (const item of payload.slice(0, 50)) {
      if (item && typeof item === "object" && (item as { type?: unknown }).type === "csp-violation") {
        const body = (item as { body?: unknown }).body;
        if (body && typeof body === "object") raw.push(body as Record<string, unknown>);
      }
    }
  } else if (payload && typeof payload === "object" && "csp-report" in payload) {
    const body = (payload as Record<string, unknown>)["csp-report"];
    if (body && typeof body === "object") raw.push(body as Record<string, unknown>);
  }

  const reports: CspReport[] = [];
  for (const body of raw) {
    const directive = directiveOf(body.effectiveDirective ?? body["effective-directive"] ?? body["violated-directive"]);
    const blocked = hostOf(body.blockedURL ?? body["blocked-uri"]);
    if (!directive || !blocked) continue;
    const disposition = String(body.disposition ?? "enforce") === "report" ? "report" : "enforce";
    reports.push({ directive, blocked, disposition, page: pathOf(body.documentURL ?? body["document-uri"]) });
  }
  return reports;
}

export async function recordCspReports(
  reports: CspReport[],
  now = new Date(),
  client: Pick<PrismaClient, "setting"> = prisma,
): Promise<void> {
  if (!reports.length) return;
  const saved = await client.setting.findUnique({ where: { key: CSP_REPORTS_SETTING } });
  const entries = new Map<string, CspEntry>(
    Object.entries((saved?.value as Record<string, CspEntry> | undefined) ?? {}),
  );
  for (const report of reports) {
    const key = `${report.disposition} ${report.directive} ${report.blocked}`;
    const entry = entries.get(key);
    if (entry) {
      entry.count += 1;
      entry.lastAt = now.toISOString();
      entry.page = report.page || entry.page;
    } else {
      entries.set(key, { ...report, count: 1, firstAt: now.toISOString(), lastAt: now.toISOString() });
    }
  }
  const kept = Object.fromEntries(
    [...entries].sort(([, a], [, b]) => b.lastAt.localeCompare(a.lastAt)).slice(0, MAX_ENTRIES),
  );
  await client.setting.upsert({
    where: { key: CSP_REPORTS_SETTING },
    create: { key: CSP_REPORTS_SETTING, value: kept },
    update: { value: kept },
  });

  // First sightings of player domains, kept past the report retention so a
  // domain raises the alert once, not again every 30 days.
  const frameHosts = [...new Set(reports.filter((report) => report.directive === "frame-src").map((report) => report.blocked))];
  if (!frameHosts.length) return;
  const seenRow = await client.setting.findUnique({ where: { key: CSP_SEEN_SETTING } });
  const seen = { ...((seenRow?.value as Record<string, string> | undefined) ?? {}) };
  const added = frameHosts.filter((host) => !(host in seen));
  if (!added.length) return;
  for (const host of added) seen[host] = now.toISOString();
  const trimmed = Object.fromEntries(Object.entries(seen).sort(([, a], [, b]) => b.localeCompare(a)).slice(0, MAX_SEEN));
  await client.setting.upsert({
    where: { key: CSP_SEEN_SETTING },
    create: { key: CSP_SEEN_SETTING, value: trimmed },
    update: { value: trimmed },
  });
}

export type NewPlayerDomain = { host: string; firstSeenAt: string };

export type DomainLabel = { kind: "ad"; at: string } | { kind: "player"; hostId: string; at: string };
/** ignored: an admin said ad; player: an admin tied it to a host; likely-ad: looks like an ad; unknown: needs a look. */
export type DomainClass = "ignored" | "player" | "likely-ad" | "unknown";

// Dood (and others) move the player frame to ad and gambling pages when a
// viewer clicks; browsers report those as unknown frame domains. Clear signs:
// ad words as a name part, gambling numbers ("88"), or a cheap TLD that ad
// networks rotate through. Such domains are listed apart, never in red.
const AD_WORDS = new Set([
  "ad", "ads", "adserver", "adserve", "adx", "banner", "bet", "bets", "betting", "bingo", "casino", "click",
  "clicks", "ezmob", "exoclick", "juicyads", "lotto", "lottery", "poker", "pop", "popads", "popunder",
  "propeller", "slot", "slots", "track", "tracker", "win", "xoso",
]);
const AD_TLDS = new Set([
  "autos", "bar", "beauty", "boats", "bond", "buzz", "cam", "cfd", "click", "cyou", "hair", "icu", "lol",
  "makeup", "mom", "monster", "pics", "qpon", "quest", "rest", "sbs", "skin", "top", "xyz", "yachts",
]);

export function looksLikeAdDomain(host: string): boolean {
  const labels = host.toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2) return false;
  if (AD_TLDS.has(labels[labels.length - 1])) return true;
  const names = labels.slice(0, -1);
  if (names.some((name) => name.split(/[-_]/).some((part) => AD_WORDS.has(part)))) return true;
  return names.some((name) => /88|casino|bet\d|\dbet|win\d|\dwin/.test(name));
}

export function classifyDomain(host: string, labels: Record<string, DomainLabel>): DomainClass {
  const label = labels[host];
  if (label?.kind === "ad") return "ignored";
  if (label?.kind === "player") return "player";
  return looksLikeAdDomain(host) ? "likely-ad" : "unknown";
}

export async function domainLabels(client: Pick<PrismaClient, "setting"> = prisma): Promise<Record<string, DomainLabel>> {
  const row = await client.setting.findUnique({ where: { key: CSP_LABELS_SETTING } });
  return (row?.value as Record<string, DomainLabel> | undefined) ?? {};
}

const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+$/;

/** "Quảng cáo — bỏ qua" / "Là player của host": never alerts again for this domain. */
export async function labelCspDomain(
  host: string,
  label: { kind: "ad" } | { kind: "player"; hostId: string },
  now = new Date(),
  client: Pick<PrismaClient, "setting"> = prisma,
): Promise<boolean> {
  const name = host.trim().toLowerCase();
  if (name.length > 253 || !HOST_PATTERN.test(name)) return false;
  const labels = { ...(await domainLabels(client)) };
  labels[name] = { ...label, at: now.toISOString() };
  await client.setting.upsert({
    where: { key: CSP_LABELS_SETTING },
    create: { key: CSP_LABELS_SETTING, value: labels },
    update: { value: labels },
  });
  return true;
}

async function seenSinceAck(client: Pick<PrismaClient, "setting">) {
  const rows = await client.setting.findMany({
    where: { key: { in: [CSP_SEEN_SETTING, CSP_ACK_SETTING, CSP_LABELS_SETTING] } },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const ack = typeof byKey.get(CSP_ACK_SETTING) === "string" ? (byKey.get(CSP_ACK_SETTING) as string) : "";
  const labels = (byKey.get(CSP_LABELS_SETTING) as Record<string, DomainLabel> | undefined) ?? {};
  const domains = Object.entries((byKey.get(CSP_SEEN_SETTING) as Record<string, string> | undefined) ?? {})
    .filter(([, firstSeenAt]) => firstSeenAt > ack)
    .map(([host, firstSeenAt]) => ({ host, firstSeenAt }))
    .sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt));
  return { domains, labels };
}

/**
 * The red alert: frame domains first reported after the last "Đã xem" that
 * are neither labelled by an admin nor look like ads. Newest first.
 */
export async function newPlayerDomains(client: Pick<PrismaClient, "setting"> = prisma): Promise<NewPlayerDomain[]> {
  const { domains, labels } = await seenSinceAck(client);
  return domains.filter((domain) => classifyDomain(domain.host, labels) === "unknown");
}

/** "Có thể là quảng cáo" (not red): unlabelled domains with clear ad signs, since the last "Đã xem". */
export async function likelyAdDomains(client: Pick<PrismaClient, "setting"> = prisma): Promise<NewPlayerDomain[]> {
  const { domains, labels } = await seenSinceAck(client);
  return domains.filter((domain) => classifyDomain(domain.host, labels) === "likely-ad");
}

/** "Đã xem": clears the alert for every domain seen so far. */
export async function acknowledgePlayerDomains(now = new Date(), client: Pick<PrismaClient, "setting"> = prisma): Promise<void> {
  await client.setting.upsert({
    where: { key: CSP_ACK_SETTING },
    create: { key: CSP_ACK_SETTING, value: now.toISOString() },
    update: { value: now.toISOString() },
  });
}

/**
 * Production self-test of report → alert (ops-status workflow): records a
 * report for a reserved test host, checks it raises the alert, then removes
 * every *.invalid test host again (reports and first sightings). The
 * acknowledgement time is not touched, so real alerts are unaffected.
 */
export async function cspSelfTest(now = new Date(), client: Pick<PrismaClient, "setting"> = prisma): Promise<boolean> {
  const host = `selftest-${now.getTime()}.invalid`;
  await recordCspReports([{ directive: "frame-src", blocked: host, disposition: "report", page: "/selftest" }], now, client);
  const alerted = (await newPlayerDomains(client)).some((domain) => domain.host === host);
  const test = (value: string) => value.endsWith(".invalid");
  const [reports, seen] = await Promise.all([
    client.setting.findUnique({ where: { key: CSP_REPORTS_SETTING } }),
    client.setting.findUnique({ where: { key: CSP_SEEN_SETTING } }),
  ]);
  if (reports) {
    const kept = Object.fromEntries(Object.entries(reports.value as Record<string, CspEntry>).filter(([, entry]) => !test(entry.blocked)));
    await client.setting.update({ where: { key: CSP_REPORTS_SETTING }, data: { value: kept } });
  }
  if (seen) {
    const kept = Object.fromEntries(Object.entries(seen.value as Record<string, string>).filter(([name]) => !test(name)));
    await client.setting.update({ where: { key: CSP_SEEN_SETTING }, data: { value: kept } });
  }
  return alerted;
}

/** Drops reports not seen for CSP_RETENTION_DAYS (run by the worker). Returns how many. */
export async function pruneCspReports(now = new Date(), client: Pick<PrismaClient, "setting"> = prisma): Promise<number> {
  const saved = await client.setting.findUnique({ where: { key: CSP_REPORTS_SETTING } });
  const entries = Object.entries((saved?.value as Record<string, CspEntry> | undefined) ?? {});
  const cutoff = new Date(now.getTime() - CSP_RETENTION_DAYS * 24 * 3600_000).toISOString();
  const kept = entries.filter(([, entry]) => entry.lastAt >= cutoff);
  if (kept.length === entries.length) return 0;
  await client.setting.update({ where: { key: CSP_REPORTS_SETTING }, data: { value: Object.fromEntries(kept) } });
  return entries.length - kept.length;
}

/** Newest first, for the admin. */
export async function listCspReports(client: Pick<PrismaClient, "setting"> = prisma): Promise<CspEntry[]> {
  const saved = await client.setting.findUnique({ where: { key: CSP_REPORTS_SETTING } });
  return Object.values((saved?.value as Record<string, CspEntry> | undefined) ?? {}).sort((a, b) =>
    b.lastAt.localeCompare(a.lastAt),
  );
}
