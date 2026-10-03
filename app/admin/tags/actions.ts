"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

const tagSchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
});

async function assertUniqueSlug(slug: string, id?: string) {
  const existing = await db.tag.findFirst({
    where: {
      slug,
      ...(id ? { id: { not: id } } : {}),
    },
    select: { id: true },
  });

  if (existing) throw new Error("Tag slug already exists.");
}

export async function createTagAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = tagSchema.parse({
    slug: formData.get("slug"),
    name: formData.get("name"),
  });

  await assertUniqueSlug(parsed.slug);

  const tag = await db.tag.create({
    data: {
      slug: parsed.slug,
      name: parsed.name,
    },
  });

  await writeAdminAudit(admin.id, "TAG_CREATE", tag.id);
  revalidatePath("/admin/tags");
}

export async function updateTagAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = tagSchema.extend({
    id: z.string().min(1),
  }).parse({
    id: formData.get("id"),
    slug: formData.get("slug"),
    name: formData.get("name"),
  });

  await assertUniqueSlug(parsed.slug, parsed.id);

  await db.tag.update({
    where: { id: parsed.id },
    data: {
      slug: parsed.slug,
      name: parsed.name,
    },
  });

  await writeAdminAudit(admin.id, "TAG_UPDATE", parsed.id);
  revalidatePath("/admin/tags");
}

export async function deleteTagAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z.object({ id: z.string().min(1) }).parse({
    id: formData.get("id"),
  });

  await db.$transaction([
    db.videoTag.deleteMany({
      where: { tagId: parsed.id },
    }),
    db.tag.delete({
      where: { id: parsed.id },
    }),
  ]);

  await writeAdminAudit(admin.id, "TAG_DELETE", parsed.id);
  revalidatePath("/admin/tags");
  revalidatePath("/admin/videos");
  revalidatePath("/admin/review");
}

export async function mergeTagAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z.object({
    sourceTagId: z.string().min(1),
    targetTagId: z.string().min(1),
  }).refine((value) => value.sourceTagId !== value.targetTagId, {
    message: "Choose two different tags.",
  }).parse({
    sourceTagId: formData.get("sourceTagId"),
    targetTagId: formData.get("targetTagId"),
  });

  const [source, target, sourceLinks] = await Promise.all([
    db.tag.findUnique({ where: { id: parsed.sourceTagId } }),
    db.tag.findUnique({ where: { id: parsed.targetTagId } }),
    db.videoTag.findMany({
      where: { tagId: parsed.sourceTagId },
      select: { videoId: true },
    }),
  ]);

  if (!source || !target) {
    throw new Error("Tag no longer exists.");
  }

  await db.$transaction(async (tx) => {
    if (sourceLinks.length) {
      await tx.videoTag.createMany({
        data: sourceLinks.map(({ videoId }) => ({
          videoId,
          tagId: target.id,
        })),
        skipDuplicates: true,
      });
    }

    await tx.videoTag.deleteMany({
      where: { tagId: source.id },
    });
    await tx.tag.delete({
      where: { id: source.id },
    });
  });

  await writeAdminAudit(
    admin.id,
    "TAG_MERGE",
    `${source.id}->${target.id}`,
  );

  revalidatePath("/admin/tags");
  revalidatePath("/admin/videos");
  revalidatePath("/admin/review");
}
