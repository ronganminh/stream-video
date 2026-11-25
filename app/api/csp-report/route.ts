import { type NextRequest } from "next/server";

import { parseCspReports, recordCspReports } from "@/lib/security/cspReports";

// Browsers post CSP violation reports here (Caddyfile: report-to csp and
// report-uri /api/csp-report). Public and unauthenticated by nature, so:
// small bodies only, a per-client rate limit, and only hostnames are kept.

const MAX_BYTES = 32 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 30;

const store = globalThis as typeof globalThis & { __gvCspRate?: Map<string, { count: number; resetAt: number }> };
const rate = (store.__gvCspRate ??= new Map());

function limited(request: NextRequest, now: number): boolean {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const entry = rate.get(key);
  if (!entry || entry.resetAt <= now) {
    if (rate.size > 5000) rate.clear();
    rate.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

export async function POST(request: NextRequest) {
  const now = Date.now();
  if (limited(request, now)) return new Response(null, { status: 204 });
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) return new Response(null, { status: 413 });

  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BYTES) return new Response(null, { status: text ? 413 : 204 });
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    await recordCspReports(parseCspReports(payload), new Date(now));
  } catch (error) {
    console.error("csp report not recorded", error instanceof Error ? error.message : error);
  }
  return new Response(null, { status: 204 });
}
