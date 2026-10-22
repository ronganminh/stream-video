import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { slugify } from "../slug";
import { cleanTitle, hasHtmlEntity } from "../text/htmlEntities";
import { recordVideoSlugChange, videoSlugOwner } from "../videoSlugs";
import { firstFreeSlug } from "./fixLostDSlugs";

// Repair titles and tag/category names stored HTML-escaped ("&#40;P1&#41;").
// Dry run by default. With reslug, a video whose slug was generated from the
// escaped title ("…-40-p1-41") also gets the slug of the clean title; one
// that has ever been published keeps the old slug as a 301. Tag and category
// slugs never change (their URLs have no redirects).

export type TitleFix = {
  kind: "video" | "tag" | "category";
  id: string;
  from: string;
  to: string;
  slug?: { from: string; to: string; redirect: boolean };
};

/**
 * The clean title's slug, if `slug` was generated from the escaped title
 * (optionally with a -N suffix). Hand-chosen slugs are left alone.
 */
export function reslugFor(escapedTitle: string, cleanTitleText: string, slug: string): string | null {
  const generated = slugify(escapedTitle);
  const clean = slugify(cleanTitleText);
  if (!generated || !clean || generated === clean) return null;
  const match = new RegExp(`^${generated}(-\\d+)?$`).exec(slug);
  return match ? clean + (match[1] ?? "") : null;
}

const hasEntityWhere = (field: "title" | "name") => ({ [field]: { contains: "&" } });

export async function planTitleFixes(
  options: { reslug?: boolean } = {},
  client: PrismaClient = prisma,
): Promise<TitleFix[]> {
  const [videos, tags, categories] = await Promise.all([
    client.video.findMany({
      where: hasEntityWhere("title"),
      select: { id: true, title: true, slug: true, publishedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    client.tag.findMany({ where: hasEntityWhere("name"), select: { id: true, name: true } }),
    client.category.findMany({ where: hasEntityWhere("name"), select: { id: true, name: true } }),
  ]);

  const claimed = new Set<string>();
  const plan: TitleFix[] = [];
  for (const video of videos) {
    if (!hasHtmlEntity(video.title)) continue;
    const to = cleanTitle(video.title);
    if (!to || to === video.title) continue;

    const fix: TitleFix = { kind: "video", id: video.id, from: video.title, to };
    const proposed = options.reslug ? reslugFor(video.title, to, video.slug) : null;
    if (proposed) {
      const { slug } = await firstFreeSlug(
        proposed,
        async (candidate) =>
          claimed.has(candidate) || (await videoSlugOwner(client, candidate, video.id)) !== null,
      );
      claimed.add(slug);
      fix.slug = { from: video.slug, to: slug, redirect: video.publishedAt !== null };
    }
    plan.push(fix);
  }
  for (const [kind, rows] of [
    ["tag", tags],
    ["category", categories],
  ] as const) {
    for (const row of rows) {
      if (!hasHtmlEntity(row.name)) continue;
      const to = cleanTitle(row.name);
      if (to && to !== row.name) plan.push({ kind, id: row.id, from: row.name, to });
    }
  }
  return plan;
}

/** One transaction per row; a row changed since planning is skipped. */
export async function applyTitleFixes(
  plan: TitleFix[],
  client: PrismaClient = prisma,
): Promise<{ applied: TitleFix[]; skipped: { fix: TitleFix; reason: string }[] }> {
  const applied: TitleFix[] = [];
  const skipped: { fix: TitleFix; reason: string }[] = [];

  for (const fix of plan) {
    try {
      await client.$transaction(async (tx) => {
        if (fix.kind === "tag" || fix.kind === "category") {
          const result =
            fix.kind === "tag"
              ? await tx.tag.updateMany({ where: { id: fix.id, name: fix.from }, data: { name: fix.to } })
              : await tx.category.updateMany({
                  where: { id: fix.id, name: fix.from },
                  data: { name: fix.to },
                });
          if (result.count !== 1) throw new Error("name changed since planning");
          return;
        }

        const current = await tx.video.findUnique({
          where: { id: fix.id },
          select: { title: true, slug: true, publishedAt: true },
        });
        if (!current) throw new Error("video no longer exists");
        if (current.title !== fix.from) throw new Error("title changed since planning");

        if (fix.slug) {
          if (current.slug !== fix.slug.from) throw new Error(`slug is now ${current.slug}`);
          if (await videoSlugOwner(tx, fix.slug.to, fix.id)) throw new Error(`${fix.slug.to} is taken`);
          await recordVideoSlugChange(tx, {
            videoId: fix.id,
            oldSlug: fix.slug.from,
            newSlug: fix.slug.to,
            wasPublished: current.publishedAt !== null,
          });
        }
        await tx.video.update({
          where: { id: fix.id },
          data: { title: fix.to, ...(fix.slug ? { slug: fix.slug.to } : {}) },
        });
      });
      applied.push(fix);
    } catch (error) {
      skipped.push({ fix, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { applied, skipped };
}
