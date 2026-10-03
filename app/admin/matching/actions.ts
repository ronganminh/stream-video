"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getHostProvider } from "@/lib/hosts/registry";
import { normalize } from "@/lib/sync/normalize";

const linkSchema = z.object({
  hostFileId: z.string().min(1),
  videoId: z.string().min(1),
});

const ignoreSchema = z.object({
  hostFileId: z.string().min(1),
});

export async function linkHostFileAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = linkSchema.parse({
    hostFileId: formData.get("hostFileId"),
    videoId: formData.get("videoId"),
  });

  const hostFile = await db.hostFile.findUnique({
    where: { id: parsed.hostFileId },
    include: { host: true },
  });

  if (!hostFile || hostFile.ignored || hostFile.linkedVideoId) {
    throw new Error("Host file is no longer available for matching.");
  }
  if (hostFile.host.isPrimary) {
    throw new Error("Primary-host files are not handled by this queue.");
  }

  const provider = getHostProvider(hostFile.hostId);
  if (!provider) {
    throw new Error("Host provider is not registered.");
  }

  const existingMirror = await db.mirror.findUnique({
    where: {
      videoId_hostId: {
        videoId: parsed.videoId,
        hostId: hostFile.hostId,
      },
    },
    select: { id: true },
  });

  if (existingMirror) {
    throw new Error("That video already has a mirror on this host.");
  }

  await db.$transaction([
    db.mirror.create({
      data: {
        videoId: parsed.videoId,
        hostId: hostFile.hostId,
        fileCode: hostFile.fileCode,
        rawTitle: hostFile.rawTitle,
        normalizedName: hostFile.normalizedName,
        embedUrl: provider.embedUrl(hostFile.fileCode),
        status: "OK",
        matchedBy: "MANUAL",
        lastCheckedAt: new Date(),
      },
    }),
    db.hostFile.update({
      where: { id: hostFile.id },
      data: {
        linkedVideoId: parsed.videoId,
        ignored: false,
      },
    }),
  ]);

  await writeAdminAudit(
    admin.id,
    "MATCHING_LINK",
    `${hostFile.id}:${parsed.videoId}`,
  );

  revalidatePath("/admin/matching");
  revalidatePath("/admin/videos");
  revalidatePath(`/admin/videos/${parsed.videoId}`);
}

export async function ignoreHostFileAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = ignoreSchema.parse({
    hostFileId: formData.get("hostFileId"),
  });

  const hostFile = await db.hostFile.findUnique({
    where: { id: parsed.hostFileId },
    select: {
      id: true,
      host: {
        select: { isPrimary: true },
      },
    },
  });

  if (!hostFile || hostFile.host.isPrimary) {
    throw new Error("Host file cannot be ignored from this queue.");
  }

  await db.hostFile.update({
    where: { id: hostFile.id },
    data: { ignored: true },
  });

  await writeAdminAudit(admin.id, "MATCHING_IGNORE", hostFile.id);
  revalidatePath("/admin/matching");
}
