import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";

const URGENT_REASONS = new Set([
  "UNDERAGE",
  "NON_CONSENSUAL",
  "ILLEGAL",
]);

const reportSchema = z.object({
  videoId: z.string().min(1),
  reason: z.enum([
    "UNDERAGE",
    "NON_CONSENSUAL",
    "ILLEGAL",
    "SPAM",
    "OTHER",
  ]),
  details: z.string().trim().max(4000).optional().default(""),
  contactEmail: z.union([
    z.string().trim().email().max(320),
    z.literal(""),
  ]).optional().default(""),
  pageUrl: z.string().url().max(2000),
  timestampSeconds: z.number().int().min(0).max(24 * 60 * 60),
  website: z.string().max(200).optional().default(""),
});

type RateEntry = {
  count: number;
  resetAt: number;
};

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;

const globalRateStore = globalThis as typeof globalThis & {
  __gvReportRateStore?: Map<string, RateEntry>;
};

function rateStore() {
  globalRateStore.__gvReportRateStore ??= new Map<string, RateEntry>();
  return globalRateStore.__gvReportRateStore;
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return ip;
}

function rateLimited(key: string) {
  const now = Date.now();
  const store = rateStore();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  if (current.count >= RATE_LIMIT) return true;
  current.count += 1;
  store.set(key, current);
  return false;
}

export async function POST(request: NextRequest) {
  let json: unknown;

  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = reportSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the report fields and try again." }, { status: 400 });
  }

  if (parsed.data.website) {
    return NextResponse.json({ ok: true, reference: "R-RECEIVED" });
  }

  if (rateLimited(clientKey(request))) {
    return NextResponse.json(
      { error: "Too many reports. Try again later." },
      { status: 429 },
    );
  }

  const video = await db.video.findFirst({
    where: {
      id: parsed.data.videoId,
      isPublished: true,
      isHidden: false,
    },
    select: { id: true },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  const report = await db.report.create({
    data: {
      videoId: video.id,
      reason: parsed.data.reason,
      urgent: URGENT_REASONS.has(parsed.data.reason),
      details: parsed.data.details || null,
      contactEmail: parsed.data.contactEmail || null,
      pageUrl: `${parsed.data.pageUrl}#t=${parsed.data.timestampSeconds}`,
      status: "OPEN",
    },
    select: { id: true },
  });

  const reference = `R-${report.id.slice(-8).toUpperCase()}`;
  return NextResponse.json({ ok: true, reference }, { status: 201 });
}
