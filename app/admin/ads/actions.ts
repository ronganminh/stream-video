"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  AD_SLOT_KEYS,
  type AdSlotKey,
} from "@/lib/data/prisma/ads";

const slotSchema = z.object({
  key: z.enum(AD_SLOT_KEYS),
  html: z.string().max(20000),
  enabled: z.boolean(),
});

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

export async function saveAdSlotAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = slotSchema.parse({
    key: formData.get("key"),
    html: formData.get("html"),
    enabled: checked(formData, "enabled"),
  });

  await db.adSlot.upsert({
    where: { key: parsed.key },
    update: {
      enabled: parsed.enabled,
      html: parsed.html,
    },
    create: {
      key: parsed.key,
      enabled: parsed.enabled,
      html: parsed.html,
    },
  });

  await writeAdminAudit(
    admin.id,
    "AD_SLOT_UPDATE",
    `${parsed.key}:${parsed.enabled ? "enabled" : "disabled"}`,
  );

  revalidatePath("/admin/ads");
}

export async function ensureAdSlots(): Promise<void> {
  const existing = await db.adSlot.findMany({
    where: {
      key: { in: [...AD_SLOT_KEYS] },
    },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((slot) => slot.key));
  const missing = AD_SLOT_KEYS.filter(
    (key): key is AdSlotKey => !existingKeys.has(key),
  );

  if (!missing.length) return;

  await db.adSlot.createMany({
    data: missing.map((key) => ({
      key,
      enabled: false,
      html: "",
    })),
    skipDuplicates: true,
  });
}
