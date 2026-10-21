import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { legacySlugify, slugify } from "../slug";

// Read-only report: slugs made before đ/Đ was handled, which dropped the
// letter ("Trần Đức" -> "tran-uc"). Nothing is changed; renaming a published
// video's slug is an admin decision (it keeps a 301 from the old slug).

export type LostDSlug = {
  kind: "video" | "tag" | "category";
  id: string;
  name: string;
  slug: string;
  proposed: string;
  published?: boolean;
};

/**
 * The slug the current rule would give `name`, if `slug` is the legacy rule's
 * output for it (optionally with a -2, -3… suffix) and the two rules differ.
 * Slugs an admin chose by hand don't match the legacy output and are left out.
 */
export function lostDSlug(name: string, slug: string): string | null {
  if (!/[đĐ]/.test(name)) return null;
  const legacy = legacySlugify(name);
  const current = slugify(name);
  if (!legacy || legacy === current) return null;
  const match = new RegExp(`^${legacy}(-\\d+)?$`).exec(slug);
  if (!match) return null;
  return current + (match[1] ?? "");
}

export async function findLostDSlugs(client: PrismaClient = prisma): Promise<LostDSlug[]> {
  const contains = (field: "title" | "name") => ({
    OR: [{ [field]: { contains: "đ" } }, { [field]: { contains: "Đ" } }],
  });
  const [videos, tags, categories] = await Promise.all([
    client.video.findMany({
      where: contains("title"),
      select: { id: true, title: true, slug: true, isPublished: true },
      orderBy: { createdAt: "asc" },
    }),
    client.tag.findMany({ where: contains("name"), select: { id: true, name: true, slug: true } }),
    client.category.findMany({
      where: contains("name"),
      select: { id: true, name: true, slug: true },
    }),
  ]);

  const found: LostDSlug[] = [];
  for (const video of videos) {
    const proposed = lostDSlug(video.title, video.slug);
    if (proposed) {
      found.push({
        kind: "video",
        id: video.id,
        name: video.title,
        slug: video.slug,
        proposed,
        published: video.isPublished,
      });
    }
  }
  for (const [kind, rows] of [
    ["tag", tags],
    ["category", categories],
  ] as const) {
    for (const row of rows) {
      const proposed = lostDSlug(row.name, row.slug);
      if (proposed) found.push({ kind, id: row.id, name: row.name, slug: row.slug, proposed });
    }
  }
  return found;
}
