"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

const reportSchema = z.object({
  id: z.string().min(1),
});

export async function resolveReportAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = reportSchema.parse({
    id: formData.get("id"),
  });

  await db.report.update({
    where: { id: parsed.id },
    data: { status: "RESOLVED" },
  });

  await writeAdminAudit(admin.id, "REPORT_RESOLVE", parsed.id);
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
}

export async function hideVideoAndResolveAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = reportSchema.parse({
    id: formData.get("id"),
  });

  const report = await db.report.findUnique({
    where: { id: parsed.id },
    select: { videoId: true },
  });
  if (!report) throw new Error("Report not found.");

  await db.$transaction([
    db.video.update({
      where: { id: report.videoId },
      data: { isHidden: true },
    }),
    db.report.update({
      where: { id: parsed.id },
      data: { status: "RESOLVED" },
    }),
  ]);

  await writeAdminAudit(
    admin.id,
    "REPORT_HIDE_VIDEO_RESOLVE",
    `${parsed.id}:${report.videoId}`,
  );

  revalidatePath("/admin/reports");
  revalidatePath("/admin/videos");
  revalidatePath("/admin");
}
