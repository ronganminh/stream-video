"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

const requestUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"]),
  notes: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(4000).nullable(),
  ),
});

export async function updateRemovalRequestAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = requestUpdateSchema.parse({
    id: formData.get("id"),
    status: formData.get("status"),
    notes: formData.get("notes"),
  });

  await db.removalRequest.update({
    where: { id: parsed.id },
    data: {
      status: parsed.status,
      notes: parsed.notes,
    },
  });

  await writeAdminAudit(
    admin.id,
    "REMOVAL_REQUEST_UPDATE",
    `${parsed.id}:${parsed.status}`,
  );

  revalidatePath("/admin/requests");
}
