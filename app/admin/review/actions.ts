"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { SLUG_PATTERN, slugFromInput } from "@/lib/slug";
import { assertVideoSlugAvailable, recordVideoSlugChange } from "@/lib/videoSlugs";
import { revalidatePublicPages } from "@/lib/revalidatePublic";
import { applyThumbnailSelection } from "@/lib/sync/thumbnailSources";

import { reviewErrorMessage, type ReviewActionResult } from "./reviewState";
import type { ThumbnailActionState } from "./thumbnailState";

const optionalId = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value : null),
  z.string().min(1).nullable(),
);

const metadataSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(240),
  // Whatever the admin typed, slugified ("Trần Đức" -> "tran-duc"); empty
  // means "from the title".
  slug: z.string().min(1, "Enter a slug or a title with letters or digits.").max(240).regex(SLUG_PATTERN),
  categoryId: optionalId,
  quality: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value : null),
    z.enum(["HD", "4K"]).nullable(),
  ),
  tagIds: z.array(z.string().min(1)).max(40),
});


function readMetadata(formData: FormData) {
  return metadataSchema.parse({
    id: formData.get("id"),
    title: formData.get("title"),
    slug: slugFromInput(formData.get("slug"), String(formData.get("title") ?? "")),
    categoryId: formData.get("categoryId"),
    quality: formData.get("quality"),
    tagIds: formData.getAll("tagId"),
  });
}

async function applyMetadata(
  data: z.infer<typeof metadataSchema>,
  publish: boolean,
) {
  await assertVideoSlugAvailable(db, data.id, data.slug);
  const current = await db.video.findUnique({
    where: { id: data.id },
    select: { slug: true, publishedAt: true },
  });
  if (!current) throw new Error("Video not found.");

  await db.$transaction(async (tx) => {
    // Drafts have no public URL yet; only a once-published video keeps a 301.
    await recordVideoSlugChange(tx, {
      videoId: data.id,
      oldSlug: current.slug,
      newSlug: data.slug,
      wasPublished: current.publishedAt !== null,
    });
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

// The review queue calls these from the client and updates itself
// optimistically, so they report failures as results instead of throwing
// (which would hit the error boundary and lose the admin's edits).
// requireAdmin stays outside the try so a session redirect still propagates.
//
// Any revalidation re-renders the whole current page in the action response,
// and /admin pages are dynamic (nothing else to purge), so only the review
// queue is revalidated: one cheap re-render that also pulls the next draft in.
// Publishing and unpublishing also purge the cached public pages.

export async function approveReviewAction(
  formData: FormData,
): Promise<ReviewActionResult> {
  const admin = await requireAdmin();

  try {
    const data = readMetadata(formData);
    await applyMetadata(data, true);
    await writeAdminAudit(admin.id, "VIDEO_APPROVE", data.id);
  } catch (error) {
    return { ok: false, error: reviewErrorMessage(error) };
  }

  revalidatePath("/admin/review");
  revalidatePublicPages();
  return { ok: true };
}

export async function saveReviewAction(
  formData: FormData,
): Promise<ReviewActionResult> {
  const admin = await requireAdmin();

  try {
    const data = readMetadata(formData);
    await applyMetadata(data, false);
    await writeAdminAudit(admin.id, "VIDEO_REVIEW_UPDATE", data.id);
  } catch (error) {
    return { ok: false, error: reviewErrorMessage(error) };
  }

  revalidatePath("/admin/review");
  return { ok: true };
}

/** Undo an approval made from the review queue: back to an unpublished draft. */
export async function undoApproveReviewAction(
  formData: FormData,
): Promise<ReviewActionResult> {
  const admin = await requireAdmin();

  try {
    const { id } = z.object({ id: z.string().min(1) }).parse({
      id: formData.get("id"),
    });
    await db.video.update({
      where: { id },
      data: { isPublished: false, publishedAt: null },
    });
    await writeAdminAudit(admin.id, "VIDEO_UNPUBLISH", id);
  } catch (error) {
    return { ok: false, error: reviewErrorMessage(error) };
  }

  revalidatePath("/admin/review");
  revalidatePublicPages();
  return { ok: true };
}

/** Undo a rejection made from the review queue: back into the queue. */
export async function undoRejectReviewAction(
  formData: FormData,
): Promise<ReviewActionResult> {
  const admin = await requireAdmin();

  try {
    const { id } = z.object({ id: z.string().min(1) }).parse({
      id: formData.get("id"),
    });
    await db.video.update({
      where: { id },
      data: { isHidden: false },
    });
    await writeAdminAudit(admin.id, "VIDEO_UNREJECT", id);
  } catch (error) {
    return { ok: false, error: reviewErrorMessage(error) };
  }

  revalidatePath("/admin/review");
  return { ok: true };
}

export async function selectReviewThumbnailAction(
  _prevState: ThumbnailActionState,
  formData: FormData,
): Promise<ThumbnailActionState> {
  // requireAdmin may redirect; keep it outside the try so the redirect
  // propagates instead of being reported as a thumbnail error.
  const admin = await requireAdmin();

  try {
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
    return { ok: true };
  } catch (error) {
    // Never crash the whole review page over one thumbnail: report the
    // reason inline so the admin can pick another, and log it for diagnosis.
    console.error("selectReviewThumbnailAction failed", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Thumbnail update failed.";
    return { ok: false, error: message };
  }
}

export async function rejectReviewAction(
  formData: FormData,
): Promise<ReviewActionResult> {
  const admin = await requireAdmin();

  try {
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
  } catch (error) {
    return { ok: false, error: reviewErrorMessage(error) };
  }

  revalidatePath("/admin/review");
  return { ok: true };
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
  revalidatePublicPages();
}
