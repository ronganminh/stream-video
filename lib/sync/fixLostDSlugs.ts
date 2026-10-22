import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { recordVideoSlugChange, videoSlugOwner } from "../videoSlugs";
import { lostDSlug } from "./lostDSlugs";

// Bulk rename of video slugs that dropped đ/Đ (see lostDSlugs). Dry run by
// default; nothing is written without apply. A video that has ever been
// published keeps its old slug as a 301 redirect, exactly as when an admin
// renames it by hand. Tags and categories are not touched (none are affected,
// and their URLs have no redirects).

export type FixScope = "drafts" | "published" | "all";

export type SlugFix = {
  id: string;
  title: string;
  from: string;
  to: string;
  /** Has a public URL out there: the old slug becomes a 301. */
  redirect: boolean;
  /** The proposed slug was taken, so a -N suffix was added. */
  suffixed: boolean;
};

/**
 * `proposed`, or proposed-2, -3… if taken. A legacy "-N" uniqueness suffix
 * on `proposed` is kept as the base, so "tran-duc-2" may become "tran-duc-2-2"
 * only when "tran-duc-2" itself is taken.
 */
export async function firstFreeSlug(
  proposed: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<{ slug: string; suffixed: boolean }> {
  for (let n = 1; n < 10_000; n += 1) {
    const candidate = n === 1 ? proposed : `${proposed}-${n}`;
    if (!(await isTaken(candidate))) return { slug: candidate, suffixed: n > 1 };
  }
  throw new Error(`No free slug for ${proposed}`);
}

function inScope(scope: FixScope, everPublished: boolean): boolean {
  if (scope === "all") return true;
  return scope === "published" ? everPublished : !everPublished;
}

export async function planLostDSlugFixes(
  options: { scope?: FixScope; ids?: string[] } = {},
  client: PrismaClient = prisma,
): Promise<SlugFix[]> {
  const scope = options.scope ?? "all";
  const videos = await client.video.findMany({
    where: {
      OR: [{ title: { contains: "đ" } }, { title: { contains: "Đ" } }],
      ...(options.ids?.length ? { id: { in: options.ids } } : {}),
    },
    select: { id: true, title: true, slug: true, publishedAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Slugs this plan already hands out, so two videos never get the same one.
  const claimed = new Set<string>();
  const plan: SlugFix[] = [];
  for (const video of videos) {
    const proposed = lostDSlug(video.title, video.slug);
    const everPublished = video.publishedAt !== null;
    if (!proposed || !inScope(scope, everPublished)) continue;

    const { slug, suffixed } = await firstFreeSlug(
      proposed,
      async (candidate) =>
        claimed.has(candidate) || (await videoSlugOwner(client, candidate, video.id)) !== null,
    );
    claimed.add(slug);
    plan.push({
      id: video.id,
      title: video.title,
      from: video.slug,
      to: slug,
      redirect: everPublished,
      suffixed,
    });
  }
  return plan;
}

/**
 * Applies a plan, one transaction per video. Each row is re-checked first:
 * a video whose slug changed since planning, or whose target slug got taken,
 * is skipped rather than overwritten.
 */
export async function applyLostDSlugFixes(
  plan: SlugFix[],
  client: PrismaClient = prisma,
): Promise<{ applied: SlugFix[]; skipped: { fix: SlugFix; reason: string }[] }> {
  const applied: SlugFix[] = [];
  const skipped: { fix: SlugFix; reason: string }[] = [];

  for (const fix of plan) {
    try {
      await client.$transaction(async (tx) => {
        const current = await tx.video.findUnique({
          where: { id: fix.id },
          select: { slug: true, publishedAt: true },
        });
        if (!current) throw new Error("video no longer exists");
        if (current.slug !== fix.from) throw new Error(`slug is now ${current.slug}`);
        if (await videoSlugOwner(tx, fix.to, fix.id)) throw new Error(`${fix.to} is taken`);

        await recordVideoSlugChange(tx, {
          videoId: fix.id,
          oldSlug: fix.from,
          newSlug: fix.to,
          wasPublished: current.publishedAt !== null,
        });
        await tx.video.update({ where: { id: fix.id }, data: { slug: fix.to } });
      });
      applied.push(fix);
    } catch (error) {
      skipped.push({ fix, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { applied, skipped };
}
