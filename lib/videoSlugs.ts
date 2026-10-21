import type { Prisma, PrismaClient } from "@prisma/client";

import { slugify } from "./slug";

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Who holds `slug`, ignoring `videoId` itself: another video's current slug,
 * or another video's old slug that still redirects to it. Either way the
 * slug is not free (taking a redirected slug would hijack old links).
 */
export async function videoSlugOwner(
  client: Client,
  slug: string,
  videoId?: string,
): Promise<"video" | "redirect" | null> {
  const [video, redirect] = await Promise.all([
    client.video.findFirst({
      where: { slug, ...(videoId ? { id: { not: videoId } } : {}) },
      select: { id: true },
    }),
    client.slugRedirect.findFirst({
      where: { slug, ...(videoId ? { videoId: { not: videoId } } : {}) },
      select: { slug: true },
    }),
  ]);
  if (video) return "video";
  if (redirect) return "redirect";
  return null;
}

/** Throws the admin-facing error when another video holds `slug`. */
export async function assertVideoSlugAvailable(client: Client, videoId: string, slug: string) {
  const owner = await videoSlugOwner(client, slug, videoId);
  if (owner === "video") throw new Error("Slug already exists.");
  if (owner === "redirect") {
    throw new Error("Slug already exists: another video used it and its old links redirect there.");
  }
}

/** A free slug for a new video: slugify(title), then -2, -3… as before. */
export async function uniqueVideoSlug(client: Client, title: string): Promise<string> {
  const base = slugify(title) || "video";
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    if (!(await videoSlugOwner(client, candidate))) return candidate;
  }
  throw new Error("Unable to generate a unique video slug");
}

/**
 * Call in the same transaction as a slug change. If the video has ever been
 * published, its old URL is out there (shares, search engines): keep it as a
 * redirect to the video. The new slug stops being a redirect, should it have
 * been one of this video's old slugs.
 */
export async function recordVideoSlugChange(
  tx: Prisma.TransactionClient,
  change: { videoId: string; oldSlug: string; newSlug: string; wasPublished: boolean },
) {
  if (change.oldSlug === change.newSlug) return;
  await tx.slugRedirect.deleteMany({ where: { slug: change.newSlug } });
  if (!change.wasPublished) return;
  await tx.slugRedirect.upsert({
    where: { slug: change.oldSlug },
    create: { slug: change.oldSlug, videoId: change.videoId },
    update: { videoId: change.videoId },
  });
}

/** The current slug of the video an old slug redirects to, if any. */
export async function redirectedVideoSlug(client: Client, slug: string): Promise<string | null> {
  const redirect = await client.slugRedirect.findUnique({
    where: { slug },
    select: { video: { select: { slug: true } } },
  });
  return redirect?.video.slug ?? null;
}
