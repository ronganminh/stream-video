"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { applyThumbnailSelection } from "@/lib/sync/thumbnailSources";

const optionalId = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value : null),
  z.string().min(1).nullable(),
);

const metadataSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(240),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  categoryId: optionalId,
  quality: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value : null),
    z.enum(["HD", "4K"]).nullable(),
  ),
  tagIds: z.array(z.string().min(1)).max(40),
});

async function assertUniqueSlug(id: string, slug: string) {
  const existing = await db.video.findFirst({
    where: {
      slug,
      id: { not: id },
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Slug already exists.");
  }
}

function readMetadata(formData: FormData) {
  return metadataSchema.parse({
    id: formData.get("id"),
    title: formData.get("title"),
    slug: formData.get("slug"),
    categoryId: formData.get("categoryId"),
    quality: formData.get("quality"),
    tagIds: formData.getAll("tagId"),
  });
}

async function applyMetadata(
  data: z.infer<typeof metadataSchema>,
  publish: boolean,
) {
  await assertUniqueSlug(data.id, data.slug);

  await db.$transaction(async (tx) => {
    await tx.video.update({
      where: { id: data.id },
      data: {
        title: data.title,
        slug: data.slug,
        categoryId: data.categoryId,
        quality: data.quality,
        ...(publish
          ? {
              isPublished: true,
              isHidden: false,
              publishedAt: new Date(),
            }
          : {}),
      },
    });

    await tx.videoTag.deleteMany({
      where: { videoId: data.id },
    });

    if (data.tagIds.length) {
      await tx.videoTag.createMany({
        data: [...new Set(data.tagIds)].map((tagId) => ({
          videoId: data.id,
          tagId,
        })),
        skipDuplicates: true,
      });
    }
  });
}

export async function approveReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  const data = readMetadata(formData);

  await applyMetadata(data, true);
  await writeAdminAudit(admin.id, "VIDEO_APPROVE", data.id);

  revalidatePath("/admin/review");
  revalidatePath("/admin/videos");
}

export async function saveReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  const data = readMetadata(formData);

  await applyMetadata(data, false);
  await writeAdminAudit(admin.id, "VIDEO_REVIEW_UPDATE", data.id);

  revalidatePath("/admin/review");
  revalidatePath(`/admin/videos/${data.id}`);
}

export async function selectReviewThumbnailAction(
  formData: FormData,
) {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      id: z.string().min(1),
      selection: z.string().trim().min(1).max(120),
    })
    .parse({
      id: formData.get("id"),
      selection: formData.get("selection"),
    });

  await applyThumbnailSelection(parsed.id, parsed.selection);
  await writeAdminAudit(
    admin.id,
    "VIDEO_THUMBNAIL_SELECT",
    `${parsed.id}:${parsed.selection}`,
  );

  revalidatePath("/admin/review");
  revalidatePath("/admin/videos");
  revalidatePath(`/admin/videos/${parsed.id}`);
}

export async function rejectReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z.object({ id: z.string().min(1) }).parse({
    id: formData.get("id"),
  });

  await db.video.update({
    where: { id: parsed.id },
    data: {
      isHidden: true,
      isPublished: false,
    },
  });
  await writeAdminAudit(admin.id, "VIDEO_REJECT", parsed.id);

  revalidatePath("/admin/review");
  revalidatePath("/admin/videos");
}

export async function bulkApproveReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      ids: z.array(z.string().min(1)).min(1).max(100),
    })
    .parse({
      ids: formData.getAll("videoId"),
    });

  const ids = [...new Set(parsed.ids)];
  await db.video.updateMany({
    where: {
      id: { in: ids },
      isPublished: false,
      isHidden: false,
    },
    data: {
      isPublished: true,
      publishedAt: new Date(),
    },
  });
  await writeAdminAudit(
    admin.id,
    "VIDEO_BULK_APPROVE",
    ids.join(","),
  );

  revalidatePath("/admin/review");
  revalidatePath("/admin/videos");
}
