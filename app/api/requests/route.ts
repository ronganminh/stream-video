import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";

const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"));

const dmcaSchema = z.object({
  type: z.literal("DMCA"),
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  role: z.enum(["OWNER", "REPRESENTATIVE"]),
  work: z.string().trim().min(1).max(4000),
  urls: z.array(httpUrl).min(1).max(20),
  declarations: z.object({
    goodFaith: z.literal(true),
    authority: z.literal(true),
  }),
  signature: z.string().trim().min(1).max(200),
  date: z.string().trim().min(1).max(80),
  website: z.string().max(200).optional().default(""),
});

const removalSchema = z.object({
  type: z.literal("REMOVAL"),
  reason: z.enum([
    "APPEAR",
    "PRIVACY",
    "NON_CONSENSUAL",
    "SAFETY",
    "OTHER",
  ]),
  urls: z.array(httpUrl).min(1).max(20),
  email: z.string().trim().email().max(320),
  details: z.string().trim().max(4000).optional().default(""),
  confirmed: z.literal(true),
  website: z.string().max(200).optional().default(""),
});

const requestSchema = z.discriminatedUnion("type", [
  dmcaSchema,
  removalSchema,
]);

export async function POST(request: NextRequest) {
  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the form fields and try again." },
      { status: 400 },
    );
  }

  if (parsed.data.website) {
    return NextResponse.json({
      ok: true,
      reference: "CR-RECEIVED",
    });
  }

  const data = parsed.data;
  const type = data.type;

  const record = await db.removalRequest.create({
    data: {
      type,
      payload:
        type === "DMCA"
          ? {
              fullName: data.fullName,
              email: data.email,
              role: data.role,
              work: data.work,
              urls: data.urls,
              declarations: data.declarations,
              signature: data.signature,
              date: data.date,
            }
          : {
              reason: data.reason,
              urls: data.urls,
              email: data.email,
              details: data.details || null,
              confirmed: true,
            },
      status: "OPEN",
    },
    select: { id: true },
  });

  const prefix = type === "DMCA" ? "DMCA" : "CR";
  const reference = prefix + "-" + record.id.slice(-8).toUpperCase();

  return NextResponse.json(
    { ok: true, reference },
    { status: 201 },
  );
}
