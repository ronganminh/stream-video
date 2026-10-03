"use server";

import bcrypt from "bcrypt";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

const settingsSchema = z.object({
  syncNewIntervalMinutes: z.coerce.number().int().positive().max(1440),
  syncHealthIntervalHours: z.coerce.number().int().positive().max(720),
  syncAutoMatchEnabled: z.boolean(),
  ageGateCookieLifetimeDays: z.union([
    z.literal(""),
    z.coerce.number().int().positive().max(3650),
  ]),
  show2257: z.boolean(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12),
    confirmPassword: z.string().min(12),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

export async function updateSettingsAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();

  const parsed = settingsSchema.safeParse({
    syncNewIntervalMinutes: formData.get("syncNewIntervalMinutes"),
    syncHealthIntervalHours: formData.get("syncHealthIntervalHours"),
    syncAutoMatchEnabled: checked(formData, "syncAutoMatchEnabled"),
    ageGateCookieLifetimeDays:
      String(formData.get("ageGateCookieLifetimeDays") ?? "").trim(),
    show2257: checked(formData, "show2257"),
  });

  if (!parsed.success) {
    redirect("/admin/settings?error=settings");
  }

  const writes = [
    db.setting.upsert({
      where: { key: "syncNewIntervalMinutes" },
      update: { value: parsed.data.syncNewIntervalMinutes },
      create: {
        key: "syncNewIntervalMinutes",
        value: parsed.data.syncNewIntervalMinutes,
      },
    }),
    db.setting.upsert({
      where: { key: "syncHealthIntervalHours" },
      update: { value: parsed.data.syncHealthIntervalHours },
      create: {
        key: "syncHealthIntervalHours",
        value: parsed.data.syncHealthIntervalHours,
      },
    }),
    db.setting.upsert({
      where: { key: "syncAutoMatchEnabled" },
      update: { value: parsed.data.syncAutoMatchEnabled },
      create: {
        key: "syncAutoMatchEnabled",
        value: parsed.data.syncAutoMatchEnabled,
      },
    }),
    db.setting.upsert({
      where: { key: "show2257" },
      update: { value: parsed.data.show2257 },
      create: {
        key: "show2257",
        value: parsed.data.show2257,
      },
    }),
  ];

  await db.$transaction(writes);

  if (parsed.data.ageGateCookieLifetimeDays === "") {
    await db.setting.deleteMany({
      where: { key: "ageGateCookieLifetimeDays" },
    });
  } else {
    await db.setting.upsert({
      where: { key: "ageGateCookieLifetimeDays" },
      update: { value: parsed.data.ageGateCookieLifetimeDays },
      create: {
        key: "ageGateCookieLifetimeDays",
        value: parsed.data.ageGateCookieLifetimeDays,
      },
    });
  }

  await writeAdminAudit(
    admin.id,
    "SETTINGS_UPDATE",
    "sync-and-public-settings",
  );

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  redirect("/admin/settings?saved=settings");
}

export async function changePasswordAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    redirect("/admin/settings?error=password");
  }

  const row = await db.adminUser.findUnique({
    where: { id: admin.id },
  });

  if (
    !row ||
    !(await bcrypt.compare(
      parsed.data.currentPassword,
      row.passwordHash,
    ))
  ) {
    redirect("/admin/settings?error=current-password");
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await db.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash },
  });
  await writeAdminAudit(admin.id, "PASSWORD_CHANGE", admin.id);

  redirect("/admin/settings?saved=password");
}
