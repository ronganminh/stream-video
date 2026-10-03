"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { storeThumbnail } from "@/lib/sync/thumbnails";

const categorySchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
  description: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(500).nullable(),
  ),
  group: z.string().trim().min(1).max(80),
  sortOrder: z.coerce.number().int().min(0).max(100000),
  trending: z.boolean(),
});

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

async function assertUniqueSlug(slug: string, id?: string) {
  const existing = await db.category.findFirst({
    where: {
      slug,
      ...(id ? { id: { not: id } } : {}),
    },
    select: { id: true },
  });

  if (existing) throw new Error("Category slug already exists.");
}

async function saveImage(
  file: FormDataEntryValue | null,
  categoryId: string,
): Promise<string | null | undefined> {
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
    throw new Error("Category image must be an image up to 8 MB.");
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  return storeThumbnail({
    url: `data:${file.type};base64,${base64}`,
    videoId: `category-${categoryId}`,
  });
}

export async function createCategoryAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = categorySchema.parse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    description: formData.get("description"),
    group: formData.get("group"),
    sortOrder: formData.get("sortOrder"),
    trending: checked(formData, "trending"),
  });

  await assertUniqueSlug(parsed.slug);

  const category = await db.category.create({
    data: {
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description,
      group: parsed.group,
      sortOrder: parsed.sortOrder,
      trending: parsed.trending,
      thumbnailPath: null,
    },
  });

  const thumbnailPath = await saveImage(
    formData.get("image"),
    category.id,
  );
  if (thumbnailPath !== undefined) {
    await db.category.update({
      where: { id: category.id },
      data: { thumbnailPath },
    });
  }

  await writeAdminAudit(admin.id, "CATEGORY_CREATE", category.id);
  revalidatePath("/admin/categories");
}

export async function updateCategoryAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = categorySchema.extend({
    id: z.string().min(1),
  }).parse({
    id: formData.get("id"),
    slug: formData.get("slug"),
    name: formData.get("name"),
    description: formData.get("description"),
    group: formData.get("group"),
    sortOrder: formData.get("sortOrder"),
    trending: checked(formData, "trending"),
  });

  await assertUniqueSlug(parsed.slug, parsed.id);
  const thumbnailPath = await saveImage(
    formData.get("image"),
    parsed.id,
  );

  await db.category.update({
    where: { id: parsed.id },
    data: {
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description,
      group: parsed.group,
      sortOrder: parsed.sortOrder,
      trending: parsed.trending,
      ...(thumbnailPath !== undefined ? { thumbnailPath } : {}),
    },
  });

  await writeAdminAudit(admin.id, "CATEGORY_UPDATE", parsed.id);
  revalidatePath("/admin/categories");
}

export async function deleteCategoryAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z.object({ id: z.string().min(1) }).parse({
    id: formData.get("id"),
  });

  await db.$transaction([
    db.video.updateMany({
      where: { categoryId: parsed.id },
      data: { categoryId: null },
    }),
    db.category.delete({
      where: { id: parsed.id },
    }),
  ]);

  await writeAdminAudit(admin.id, "CATEGORY_DELETE", parsed.id);
  revalidatePath("/admin/categories");
  revalidatePath("/admin/videos");
  revalidatePath("/admin/review");
}
