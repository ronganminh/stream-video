import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";

const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"));

const dmcaSchema = z
  .object({
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
  })
  .strict();

const removalSchema = z
  .object({
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
  })
  .strict();

const requestSchema = z.discriminatedUnion("type", [
  dmcaSchema,
  removalSchema,
]);

function checked(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

function normalizeFormData(form: FormData): unknown {
  const type = form.get("type");

  if (type === "DMCA") {
    return {
      type,
      fullName: form.get("fullName"),
      email: form.get("email"),
      role: form.get("role"),
      work: form.get("work"),
      urls: form.getAll("urls"),
      declarations: {
        goodFaith: checked(form.get("goodFaith")),
        authority: checked(form.get("authority")),
      },
      signature: form.get("signature"),
      date: form.get("date"),
      website: form.get("website") ?? "",
    };
  }

  if (type === "REMOVAL") {
    return {
      type,
      reason: form.get("reason"),
      urls: form.getAll("urls"),
      email: form.get("email"),
      details: form.get("details") ?? "",
      confirmed: checked(form.get("confirmed")),
      website: form.get("website") ?? "",
    };
  }

  return { type };
}

async function requestInput(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    return normalizeFormData(await request.formData());
  }

  return request.json();
}

export async function POST(request: NextRequest) {
  let input: unknown;

  try {
    input = await requestInput(request);
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
