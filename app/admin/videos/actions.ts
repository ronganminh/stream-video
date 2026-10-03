"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

const idsSchema = z.array(z.string().min(1)).min(1).max(200);

const bulkSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("hide"),
    ids: idsSchema,
  }),
  z.object({
    intent: z.literal("unhide"),
    ids: idsSchema,
  }),
  z.object({
    intent: z.literal("apply-category"),
    ids: idsSchema,
    categoryId: z.preprocess(
      (value) => (typeof value === "string" && value.trim() ? value : null),
      z.string().min(1).nullable(),
    ),
  }),
  z.object({
    intent: z.literal("replace-tags"),
    ids: idsSchema,
    tagIds: z.array(z.string().min(1)).max(40),
  }),
]);

export async function bulkVideoAction(formData: FormData) {
  const admin = await requireAdmin();
  const intent = String(formData.get("intent") ?? "");

  const parsed = bulkSchema.parse({
    intent,
    ids: formData.getAll("videoId"),
    categoryId: formData.get("categoryId"),
    tagIds: formData.getAll("tagId"),
  });

  const ids = [...new Set(parsed.ids)];

  if (parsed.intent === "hide" || parsed.intent === "unhide") {
    await db.video.updateMany({
      where: { id: { in: ids } },
      data: { isHidden: parsed.intent === "hide" },
    });
  } else if (parsed.intent === "apply-category") {
    await db.video.updateMany({
      where: { id: { in: ids } },
      data: { categoryId: parsed.categoryId },
    });
  } else {
    const tagIds = [...new Set(parsed.tagIds)];
    await db.$transaction(async (tx) => {
      await tx.videoTag.deleteMany({
        where: { videoId: { in: ids } },
      });

      if (tagIds.length) {
        await tx.videoTag.createMany({
          data: ids.flatMap((videoId) =>
            tagIds.map((tagId) => ({ videoId, tagId })),
          ),
          skipDuplicates: true,
        });
      }
    });
  }

  await writeAdminAudit(
    admin.id,
    `VIDEO_BULK_${parsed.intent.toUpperCase().replaceAll("-", "_")}`,
    ids.join(","),
  );

  revalidatePath("/admin/videos");
  revalidatePath("/admin/review");
}
