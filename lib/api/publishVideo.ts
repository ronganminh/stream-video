import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { db } from "@/lib/db";
import { getHostProvider } from "@/lib/hosts/registry";
import type { HostFileDTO } from "@/lib/hosts/types";
import { slugify, SLUG_PATTERN } from "@/lib/slug";
import { findClip, isClipId } from "@/lib/social/clips";
import { socialConfig } from "@/lib/social/config";
import { enqueueXPost } from "@/lib/social/queue";
import { tagConnectData } from "@/lib/sync/migrationMetadata";
import { normalize } from "@/lib/sync/normalize";
import { storeThumbnail } from "@/lib/sync/thumbnails";
import { applySourceThumbnail } from "@/lib/sync/thumbnailSources";
import {
  assertVideoSlugAvailable,
  recordVideoSlugChange,
  uniqueVideoSlug,
} from "@/lib/videoSlugs";

import type { ApiActor } from "./tokens";

// POST /api/v1/videos: create a video from files already uploaded to the
// hosts, or update the draft those files already belong to (for example one
// the worker's sync created first). Same rules as the admin UI: slugs keep
// đ, collisions are refused, published videos are never overwritten here.

const DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

export const publishInputSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    slug: z.string().trim().min(1).max(240).optional(),
    description: z.string().trim().max(5000).optional(),
    mirrors: z
      .array(
        z.object({
          host: z.string().trim().min(1).max(40),
          fileCode: z.string().trim().min(1).max(200),
        }),
      )
      .min(1)
      .max(5),
    categorySlug: z.string().trim().min(1).max(120).optional(),
    tags: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
    quality: z.enum(["HD", "4K"]).optional(),
    thumbnailUrl: z
      .string()
      .url()
      .refine((url) => /^https?:\/\//i.test(url), "thumbnailUrl must be http(s)")
      .optional(),
    // A local image from a laptop/Colab, as a data: URL (max ~8 MB of image).
    thumbnailDataUrl: z.string().max(11_200_000).regex(DATA_URL).optional(),
    publish: z.boolean().default(false),
    // Also announce it on X (through Buffer) once it is public: an English
    // caption and a clip uploaded first with POST /api/v1/clips.
    x: z
      .object({
        caption: z.string().trim().min(1).max(1000),
        clipId: z.string().refine(isClipId, "clipId comes from POST /api/v1/clips"),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((input) => !(input.thumbnailUrl && input.thumbnailDataUrl), {
    message: "Send thumbnailUrl or thumbnailDataUrl, not both",
  });

export type PublishInput = z.infer<typeof publishInputSchema>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export type PublishedVideo = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  url: string;
  adminUrl: string;
  thumbnailPath: string | null;
};

export type PublishResult = {
  created: boolean;
  video: PublishedVideo;
  /** The X post, when one was requested: waiting (draft), queued, or already in Buffer. */
  x?: { status: string };
  warnings: string[];
};

type ResolvedMirror = {
  hostId: string;
  isPrimary: boolean;
  file: HostFileDTO;
  embedUrl: string;
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The host's own record of a file. The host API is authoritative; when it
 * can't be reached (no API key, outage) a file the sync already indexed is
 * accepted with a warning. A file the host says doesn't exist is refused.
 */
async function resolveHostFile(
  hostId: string,
  fileCode: string,
  warnings: string[],
): Promise<HostFileDTO> {
  const provider = getHostProvider(hostId);
  if (!provider) {
    throw new ApiError(422, "unknown_host", `Host "${hostId}" is not supported.`);
  }

  let lookupError: unknown;
  try {
    const info = await provider.getFileInfo(fileCode);
    if (!info) {
      throw new ApiError(422, "file_not_found", `File "${fileCode}" was not found on ${hostId}.`);
    }
    return info;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    lookupError = error;
  }

  const indexed = await db.hostFile.findUnique({
    where: { hostId_fileCode: { hostId, fileCode } },
    select: { rawTitle: true },
  });
  if (!indexed) {
    throw new ApiError(
      502,
      "host_unavailable",
      `Could not check "${fileCode}" on ${hostId}: ${errorText(lookupError)}`,
    );
  }
  warnings.push(`${hostId} API unavailable; used the synced record of ${fileCode}.`);
  return {
    code: fileCode,
    title: indexed.rawTitle,
    lengthSeconds: null,
    thumbnailUrl: null,
    uploadedAt: null,
  };
}

function publicVideo(video: {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
  thumbnailPath: string | null;
}): PublishedVideo {
  return {
    id: video.id,
    slug: video.slug,
    title: video.title,
    published: video.isPublished,
    url: `/watch/${video.slug}`,
    adminUrl: `/admin/videos/${video.id}`,
    thumbnailPath: video.thumbnailPath,
  };
}

export async function publishVideo(input: PublishInput, actor: ApiActor): Promise<PublishResult> {
  const warnings: string[] = [];
  const title = input.title.replace(/\s+/g, " ");

  // Refuse a bad clip before writing anything.
  if (input.x && !(await findClip(input.x.clipId))) {
    throw new ApiError(422, "unknown_clip", "That clip was not found: upload it with POST /api/v1/clips first.");
  }

  // 1. Hosts: known, enabled, one file per host.
  const hostIds = input.mirrors.map((mirror) => mirror.host);
  if (new Set(hostIds).size !== hostIds.length) {
    throw new ApiError(422, "duplicate_host", "Send at most one file per host.");
  }
  const hosts = await db.host.findMany({
    where: { id: { in: hostIds } },
    select: { id: true, enabled: true, isPrimary: true },
  });
  const hostById = new Map(hosts.map((host) => [host.id, host]));
  for (const hostId of hostIds) {
    const host = hostById.get(hostId);
    if (!host?.enabled) {
      throw new ApiError(422, "unknown_host", `Host "${hostId}" is unknown or disabled.`);
    }
  }

  // 2. Files that already belong to a video: that video is the target.
  const existingMirrors = await db.mirror.findMany({
    where: {
      OR: input.mirrors.map((mirror) => ({ hostId: mirror.host, fileCode: mirror.fileCode })),
    },
    select: {
      hostId: true,
      fileCode: true,
      video: {
        select: {
          id: true,
          slug: true,
          title: true,
          isPublished: true,
          publishedAt: true,
          thumbnailPath: true,
        },
      },
    },
  });
  const existingVideoIds = new Set(existingMirrors.map((mirror) => mirror.video.id));
  if (existingVideoIds.size > 1) {
    throw new ApiError(409, "files_in_different_videos", "These files belong to different videos.", {
      videos: [...new Map(existingMirrors.map((m) => [m.video.id, publicVideo(m.video)])).values()],
    });
  }
  const target = existingMirrors[0]?.video ?? null;
  if (target?.isPublished) {
    throw new ApiError(
      409,
      "already_published",
      "These files already belong to a published video; edit it in the admin.",
      { video: publicVideo(target) },
    );
  }
  const known = new Set(existingMirrors.map((mirror) => `${mirror.hostId}:${mirror.fileCode}`));

  // 3. Check the new files on their hosts.
  const newMirrors: ResolvedMirror[] = [];
  for (const mirror of input.mirrors) {
    if (known.has(`${mirror.host}:${mirror.fileCode}`)) continue;
    const file = await resolveHostFile(mirror.host, mirror.fileCode, warnings);
    newMirrors.push({
      hostId: mirror.host,
      isPrimary: Boolean(hostById.get(mirror.host)?.isPrimary),
      file,
      embedUrl: getHostProvider(mirror.host)!.embedUrl(file.code),
    });
  }
  if (target) {
    const taken = await db.mirror.findMany({
      where: { videoId: target.id, hostId: { in: newMirrors.map((mirror) => mirror.hostId) } },
      select: { hostId: true },
    });
    if (taken.length) {
      throw new ApiError(
        409,
        "host_already_linked",
        `The video already has a different file on ${taken.map((row) => row.hostId).join(", ")}.`,
        { video: publicVideo(target) },
      );
    }
  }

  // 4. Category and slug.
  let categoryId: string | undefined;
  if (input.categorySlug) {
    const category = await db.category.findFirst({
      where: { slug: input.categorySlug },
      select: { id: true },
    });
    if (!category) {
      throw new ApiError(422, "unknown_category", `Category "${input.categorySlug}" does not exist.`);
    }
    categoryId = category.id;
  }

  let slug: string;
  if (input.slug) {
    slug = slugify(input.slug);
    if (!SLUG_PATTERN.test(slug)) {
      throw new ApiError(422, "invalid_slug", "The slug has no letters or digits.");
    }
    try {
      await assertVideoSlugAvailable(db, target?.id ?? "", slug);
    } catch (error) {
      throw new ApiError(409, "slug_taken", errorText(error));
    }
  } else {
    slug = target?.slug ?? (await uniqueVideoSlug(db, title));
  }

  const tagLinks = input.tags ? await tagConnectData(input.tags) : null;
  const primaryFile = newMirrors.find((mirror) => mirror.isPrimary)?.file ?? newMirrors[0]?.file;
  const now = new Date();

  // 5. Write the video, its mirrors and tags.
  const videoId = await db.$transaction(async (tx) => {
    const data = {
      title,
      slug,
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(input.quality ? { quality: input.quality } : {}),
      ...(primaryFile?.lengthSeconds ? { durationSeconds: primaryFile.lengthSeconds } : {}),
      ...(input.publish
        ? { isPublished: true, isHidden: false, publishedAt: target?.publishedAt ?? now }
        : {}),
    };

    let id: string;
    if (target) {
      await recordVideoSlugChange(tx, {
        videoId: target.id,
        oldSlug: target.slug,
        newSlug: slug,
        wasPublished: target.publishedAt !== null,
      });
      await tx.video.update({ where: { id: target.id }, data });
      id = target.id;
    } else {
      const created = await tx.video.create({
        data: { ...data, status: "AVAILABLE", isPublished: input.publish, isHidden: false },
        select: { id: true },
      });
      id = created.id;
    }

    for (const mirror of newMirrors) {
      await tx.mirror.create({
        data: {
          videoId: id,
          hostId: mirror.hostId,
          fileCode: mirror.file.code,
          rawTitle: mirror.file.title,
          normalizedName: normalize(mirror.file.title),
          embedUrl: mirror.embedUrl,
          hostThumbnailUrl: mirror.file.thumbnailUrl,
          lengthSeconds: mirror.file.lengthSeconds,
          status: "OK",
          matchedBy: mirror.isPrimary ? "PRIMARY" : "MANUAL",
          lastCheckedAt: now,
        },
      });
      await tx.hostFile.upsert({
        where: { hostId_fileCode: { hostId: mirror.hostId, fileCode: mirror.file.code } },
        create: {
          hostId: mirror.hostId,
          fileCode: mirror.file.code,
          rawTitle: mirror.file.title,
          normalizedName: normalize(mirror.file.title),
          linkedVideoId: id,
        },
        update: { linkedVideoId: id },
      });
    }

    if (tagLinks) {
      await tx.videoTag.deleteMany({ where: { videoId: id } });
      if (tagLinks.length) {
        await tx.videoTag.createMany({
          data: tagLinks.map((link) => ({ videoId: id, tagId: link.tagId })),
          skipDuplicates: true,
        });
      }
    }
    return id;
  });

  // 6. Thumbnail. A failure leaves the video as is and is reported.
  try {
    if (input.thumbnailDataUrl) {
      const thumbnailPath = await storeThumbnail({ url: input.thumbnailDataUrl, videoId });
      if (thumbnailPath) await db.video.update({ where: { id: videoId }, data: { thumbnailPath } });
    } else if (input.thumbnailUrl) {
      await applySourceThumbnail(videoId, input.thumbnailUrl);
    } else if (!target?.thumbnailPath) {
      const hostThumbnail = newMirrors.find((mirror) => mirror.file.thumbnailUrl)?.file.thumbnailUrl;
      if (hostThumbnail) {
        const thumbnailPath = await storeThumbnail({ url: hostThumbnail, videoId });
        if (thumbnailPath) await db.video.update({ where: { id: videoId }, data: { thumbnailPath } });
      } else {
        warnings.push("No thumbnail: send thumbnailUrl or thumbnailDataUrl, or pick one in the admin.");
      }
    }
  } catch (error) {
    warnings.push(`Thumbnail failed: ${errorText(error)}`);
  }

  await writeAdminAudit(
    actor.adminId,
    target ? "API_VIDEO_UPDATE" : "API_VIDEO_CREATE",
    `${videoId} via ${actor.tokenName}`,
  );
  if (input.publish) await writeAdminAudit(actor.adminId, "API_VIDEO_PUBLISH", videoId);

  // 7. X. Never fails the web publish: problems become warnings.
  let x: PublishResult["x"];
  if (input.x) {
    try {
      const queued = await enqueueXPost({ videoId, clipId: input.x.clipId, caption: input.x.caption });
      x = { status: queued.status };
      if (queued.warning) warnings.push(queued.warning);
      if (!socialConfig().enabled) {
        warnings.push("Buffer is not configured on the server (BUFFER_API_KEY); the X post waits until it is.");
      }
    } catch (error) {
      warnings.push(`X post not queued: ${errorText(error)}`);
    }
  }

  const video = await db.video.findUniqueOrThrow({
    where: { id: videoId },
    select: { id: true, slug: true, title: true, isPublished: true, thumbnailPath: true },
  });
  return { created: !target, video: publicVideo(video), ...(x ? { x } : {}), warnings };
}

export async function getVideoForApi(id: string) {
  const video = await db.video.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      isPublished: true,
      isHidden: true,
      status: true,
      quality: true,
      thumbnailPath: true,
      publishedAt: true,
      createdAt: true,
      category: { select: { slug: true, name: true } },
      videoTags: { select: { tag: { select: { slug: true, name: true } } } },
      mirrors: { select: { hostId: true, fileCode: true, status: true } },
      socialPosts: {
        select: { network: true, status: true, externalLink: true, lastError: true, sentAt: true },
      },
    },
  });
  if (!video) return null;
  return {
    ...publicVideo(video),
    description: video.description,
    hidden: video.isHidden,
    status: video.status,
    quality: video.quality,
    publishedAt: video.publishedAt,
    createdAt: video.createdAt,
    category: video.category,
    tags: video.videoTags.map(({ tag }) => tag),
    mirrors: video.mirrors.map((mirror) => ({
      host: mirror.hostId,
      fileCode: mirror.fileCode,
      status: mirror.status,
    })),
    social: video.socialPosts,
  };
}
