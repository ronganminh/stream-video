"use server";

import type { Availability } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getHostProvider } from "@/lib/hosts/registry";
import { normalize } from "@/lib/sync/normalize";
import { storeThumbnail } from "@/lib/sync/thumbnails";

const availabilityValues = [
  "AVAILABLE",
  "PROCESSING",
  "REMOVED",
  "BLOCKED",
  "AGE_RESTRICTED",
  "REGION_RESTRICTED",
  "FAILED",
] as const satisfies readonly Availability[];

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  z.string().nullable(),
);

const optionalInteger = z.preprocess(
  (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    return Number(value);
  },
  z.number().int().nonnegative().nullable(),
);

const editSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(240),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: optionalString,
  durationSeconds: optionalInteger,
  quality: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value : null),
    z.enum(["HD", "4K"]).nullable(),
  ),
  status: z.enum(availabilityValues),
  categoryId: optionalString,
  tagIds: z.array(z.string().min(1)).max(40),
  isPublished: z.boolean(),
  isHidden: z.boolean(),
  hotOverride: z.boolean(),
  ageRestricted: z.boolean(),
});

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

async function assertUniqueSlug(id: string, slug: string) {
  const existing = await db.video.findFirst({
    where: {
      slug,
      id: { not: id },
    },
    select: { id: true },
  });

  if (existing) throw new Error("Slug already exists.");
}

export async function saveVideoAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = editSchema.parse({
    id: formData.get("id"),
    title: formData.get("title"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    durationSeconds: formData.get("durationSeconds"),
    quality: formData.get("quality"),
    status: formData.get("status"),
    categoryId: formData.get("categoryId"),
    tagIds: formData.getAll("tagId"),
    isPublished: checked(formData, "isPublished"),
    isHidden: checked(formData, "isHidden"),
    hotOverride: checked(formData, "hotOverride"),
    ageRestricted: checked(formData, "ageRestricted"),
  });

  await assertUniqueSlug(parsed.data.id, parsed.data.slug);
  const current = await db.video.findUnique({
    where: { id: parsed.data.id },
    select: { publishedAt: true },
  });
  if (!current) throw new Error("Video not found.");

  await db.$transaction(async (tx) => {
    await tx.video.update({
      where: { id: parsed.data.id },
      data: {
        title: parsed.data.title,
        slug: parsed.data.slug,
        description: parsed.data.description,
        durationSeconds: parsed.data.durationSeconds,
        quality: parsed.data.quality,
        status: parsed.data.status,
        categoryId: parsed.data.categoryId,
        isPublished: parsed.data.isPublished,
        isHidden: parsed.data.isHidden,
        hotOverride: parsed.data.hotOverride,
        ageRestricted: parsed.data.ageRestricted,
        publishedAt:
          parsed.data.isPublished && !current.publishedAt
            ? new Date()
            : current.publishedAt,
      },
    });

    await tx.videoTag.deleteMany({
      where: { videoId: parsed.data.id },
    });

    const tagIds = [...new Set(parsed.data.tagIds)];
    if (tagIds.length) {
      await tx.videoTag.createMany({
        data: tagIds.map((tagId) => ({
          videoId: parsed.data.id,
          tagId,
        })),
        skipDuplicates: true,
      });
    }
  });

  await writeAdminAudit(admin.id, "VIDEO_UPDATE", parsed.data.id);
  revalidatePath(`/admin/videos/${parsed.data.id}`);
  revalidatePath("/admin/videos");
  revalidatePath("/admin/review");
}

export async function replaceThumbnailAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z.object({ id: z.string().min(1) }).parse({
    id: formData.get("id"),
  });
  const file = formData.get("thumbnail");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose an image file.");
  }
  if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
    throw new Error("Thumbnail must be an image up to 8 MB.");
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const thumbnailPath = await storeThumbnail({
    url: `data:${file.type};base64,${base64}`,
    videoId: parsed.data.id,
  });

  if (!thumbnailPath) throw new Error("Thumbnail conversion failed.");

  await db.video.update({
    where: { id: parsed.data.id },
    data: { thumbnailPath },
  });
  await writeAdminAudit(
    admin.id,
    "VIDEO_THUMBNAIL_REPLACE",
    parsed.data.id,
  );

  revalidatePath(`/admin/videos/${parsed.data.id}`);
  revalidatePath("/admin/review");
}

const mirrorSchema = z.object({
  videoId: z.string().min(1),
  hostId: z.string().min(1),
  fileCode: z.string().trim().min(1).max(240),
});

export async function linkMirrorAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = mirrorSchema.parse({
    videoId: formData.get("videoId"),
    hostId: formData.get("hostId"),
    fileCode: formData.get("fileCode"),
  });

  const [host, existing] = await Promise.all([
    db.host.findUnique({
      where: { id: parsed.data.hostId },
      select: { id: true, enabled: true },
    }),
    db.mirror.findUnique({
      where: {
        videoId_hostId: {
          videoId: parsed.data.videoId,
          hostId: parsed.data.hostId,
        },
      },
      select: { id: true },
    }),
  ]);

  if (!host?.enabled) throw new Error("Host is not enabled.");
  if (existing) throw new Error("This video already has a mirror on that host.");

  const provider = getHostProvider(parsed.data.hostId);
  if (!provider) throw new Error("Host provider is not registered.");

  const info = await provider.getFileInfo(parsed.data.fileCode);
  if (!info) throw new Error("Host file was not found.");

  await db.$transaction(async (tx) => {
    await tx.mirror.create({
      data: {
        videoId: parsed.data.videoId,
        hostId: parsed.data.hostId,
        fileCode: info.code,
        rawTitle: info.title,
        normalizedName: normalize(info.title),
        embedUrl: provider.embedUrl(info.code),
        hostThumbnailUrl: info.thumbnailUrl,
        lengthSeconds: info.lengthSeconds,
        status: "OK",
        matchedBy: "MANUAL",
        lastCheckedAt: new Date(),
      },
    });

    await tx.hostFile.upsert({
      where: {
        hostId_fileCode: {
          hostId: parsed.data.hostId,
          fileCode: info.code,
        },
      },
      create: {
        hostId: parsed.data.hostId,
        fileCode: info.code,
        rawTitle: info.title,
        normalizedName: normalize(info.title),
        linkedVideoId: parsed.data.videoId,
      },
      update: {
        rawTitle: info.title,
        normalizedName: normalize(info.title),
        linkedVideoId: parsed.data.videoId,
      },
    });
  });

  await writeAdminAudit(
    admin.id,
    "MIRROR_LINK",
    `${parsed.data.videoId}:${parsed.data.hostId}:${info.code}`,
  );

  revalidatePath(`/admin/videos/${parsed.data.videoId}`);
  revalidatePath("/admin/videos");
}

export async function unlinkMirrorAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      videoId: z.string().min(1),
      mirrorId: z.string().min(1),
    })
    .parse({
      videoId: formData.get("videoId"),
      mirrorId: formData.get("mirrorId"),
    });

  const mirror = await db.mirror.findFirst({
    where: {
      id: parsed.data.mirrorId,
      videoId: parsed.data.videoId,
    },
  });
  if (!mirror) throw new Error("Mirror not found.");

  await db.$transaction([
    db.mirror.delete({ where: { id: mirror.id } }),
    db.hostFile.updateMany({
      where: {
        hostId: mirror.hostId,
        fileCode: mirror.fileCode,
        linkedVideoId: parsed.data.videoId,
      },
      data: { linkedVideoId: null },
    }),
  ]);

  await writeAdminAudit(
    admin.id,
    "MIRROR_UNLINK",
    `${parsed.data.videoId}:${mirror.hostId}:${mirror.fileCode}`,
  );

  revalidatePath(`/admin/videos/${parsed.data.videoId}`);
  revalidatePath("/admin/videos");
}

export async function recheckMirrorAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      videoId: z.string().min(1),
      mirrorId: z.string().min(1),
    })
    .parse({
      videoId: formData.get("videoId"),
      mirrorId: formData.get("mirrorId"),
    });

  const mirror = await db.mirror.findFirst({
    where: {
      id: parsed.data.mirrorId,
      videoId: parsed.data.videoId,
    },
  });
  if (!mirror) throw new Error("Mirror not found.");

  const provider = getHostProvider(mirror.hostId);
  if (!provider) throw new Error("Host provider is not registered.");

  try {
    const info = await provider.getFileInfo(mirror.fileCode);
    await db.mirror.update({
      where: { id: mirror.id },
      data: info
        ? {
            status: "OK",
            rawTitle: info.title,
            normalizedName: normalize(info.title),
            embedUrl: provider.embedUrl(info.code),
            hostThumbnailUrl: info.thumbnailUrl,
            lengthSeconds: info.lengthSeconds,
            lastCheckedAt: new Date(),
          }
        : {
            status: "MISSING",
            lastCheckedAt: new Date(),
          },
    });

    await writeAdminAudit(
      admin.id,
      "MIRROR_RECHECK",
      `${parsed.data.videoId}:${mirror.hostId}:${mirror.fileCode}`,
    );
  } catch (error) {
    await db.mirror.update({
      where: { id: mirror.id },
      data: {
        status: "ERROR",
        lastCheckedAt: new Date(),
      },
    });
    await writeAdminAudit(
      admin.id,
      "MIRROR_RECHECK_ERROR",
      `${parsed.data.videoId}:${mirror.hostId}:${mirror.fileCode}`,
    );

    if (error instanceof Error) {
      console.error("Mirror re-check failed", error.message);
    }
  }

  revalidatePath(`/admin/videos/${parsed.data.videoId}`);
  revalidatePath("/admin/videos");
}
