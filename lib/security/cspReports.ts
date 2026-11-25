import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";

// CSP violation reports from visitors' browsers (Caddyfile: report-to csp,
// report-uri /api/csp-report). Hosts rotate their player domains (Dood, VOE);
// the report-only policy keeps the known list, so a new player domain shows
// up here before anyone has to describe it. Only the blocked hostname, the
// directive and our page path are kept: never full URLs (they can carry file
// codes or tokens), never IPs.

export const CSP_REPORTS_SETTING = "security.cspBlocked";
const MAX_ENTRIES = 200;

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
}

/** Newest first, for the admin. */
export async function listCspReports(client: Pick<PrismaClient, "setting"> = prisma): Promise<CspEntry[]> {
  const saved = await client.setting.findUnique({ where: { key: CSP_REPORTS_SETTING } });
  return Object.values((saved?.value as Record<string, CspEntry> | undefined) ?? {}).sort((a, b) =>
    b.lastAt.localeCompare(a.lastAt),
  );
}
