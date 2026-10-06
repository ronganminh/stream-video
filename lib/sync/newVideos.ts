import type { Host, SyncRun } from "@prisma/client";

import { prisma } from "../db";
import { getHostProvider, hostRegistry } from "../hosts/registry";
import type { HostFileDTO, HostProvider } from "../hosts/types";
import {
  attachPrimaryFileToExistingVideo,
  autoMatchHostFiles,
  titleFromFilename,
} from "./match";
import {
  EMPTY_MIGRATION_METADATA,
  loadMigrationMetadata,
  tagConnectData,
  type MigrationMetadataIndex,
} from "./migrationMetadata";
import { normalize } from "./normalize";
import { getSyncSettings, withSyncLock } from "./settings";
import { storeThumbnail } from "./thumbnails";
import { applySourceThumbnail } from "./thumbnailSources";

const PAGE_SIZE = 100;

export type SyncJobResult = {
  run: SyncRun;
  skipped: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function slugBase(title: string): string {
  const value = normalize(title).replace(/\s+/g, "-");
  return value || "video";
}

async function uniqueSlug(title: string): Promise<string> {
  const base = slugBase(title);

  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const exists = await prisma.video.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }

  throw new Error("Unable to generate a unique video slug");
}

export function buildPrimaryVideoData(
  hostId: string,
  provider: HostProvider,
  file: HostFileDTO,
  slug: string,
  tagLinks: { tagId: string }[] = [],
) {
  const title = titleFromFilename(file.title) || file.code;

  return {
    slug,
    title,
    durationSeconds: file.lengthSeconds,
    thumbnailPath: null,
    status: "AVAILABLE" as const,
    isPublished: false,
    isHidden: false,
    mirrors: {
      create: {
        hostId,
        fileCode: file.code,
        rawTitle: file.title,
        normalizedName: normalize(file.title),
        embedUrl: provider.embedUrl(file.code),
        hostThumbnailUrl: file.thumbnailUrl,
        lengthSeconds: file.lengthSeconds,
        status: "OK" as const,
        matchedBy: "PRIMARY" as const,
        lastCheckedAt: new Date(),
      },
    },
    ...(tagLinks.length > 0
      ? { videoTags: { create: tagLinks } }
      : {}),
  };
}

async function createPrimaryVideo(
  host: Host,
  provider: HostProvider,
  file: HostFileDTO,
  errors: string[],
  metadata: MigrationMetadataIndex = EMPTY_MIGRATION_METADATA,
): Promise<void> {
  const title = titleFromFilename(file.title) || file.code;
  const slug = await uniqueSlug(title);
  let tagLinks: { tagId: string }[] = [];

  try {
    tagLinks = await tagConnectData(
      metadata.tagsByHostCode.get(file.code) ?? [],
    );
  } catch (error) {
    errors.push(`${host.id} tags ${file.code}: ${errorMessage(error)}`);
  }

  const video = await prisma.video.create({
    data: buildPrimaryVideoData(host.id, provider, file, slug, tagLinks),
    select: { id: true },
  });

  // Prefer the migration CSV source thumbnail as the default for migrated
  // videos (T39); fall back to the host thumbnail when no source is available
  // or the source cannot be fetched.
  const sourceThumbnailUrl = metadata.sourceThumbnailByHostCode.get(file.code);
  if (sourceThumbnailUrl) {
    try {
      await applySourceThumbnail(video.id, sourceThumbnailUrl);
      return;
    } catch (error) {
      errors.push(
        `${host.id} source thumbnail ${file.code}: ${errorMessage(error)}`,
      );
    }
  }

  if (!file.thumbnailUrl) return;

  try {
    const thumbnailPath = await storeThumbnail({
      url: file.thumbnailUrl,
      videoId: video.id,
    });
    if (thumbnailPath) {
      await prisma.video.update({
        where: { id: video.id },
        data: { thumbnailPath },
      });
    }
  } catch (error) {
    errors.push(
      `${host.id} thumbnail ${file.code}: ${errorMessage(error)}`,
    );
  }
}

async function syncPrimaryHost(
  host: Host,
  provider: HostProvider,
  errors: string[],
  metadata: MigrationMetadataIndex = EMPTY_MIGRATION_METADATA,
): Promise<{ created: number; matched: number }> {
  let created = 0;
  let matched = 0;

  for (let page = 1; ; page += 1) {
    const { files, hasMore } = await provider.listFiles({
      page,
      perPage: PAGE_SIZE,
    });

    if (files.length === 0) break;

    const existing = await prisma.mirror.findMany({
      where: {
        hostId: host.id,
        fileCode: { in: files.map((file) => file.code) },
      },
      select: {
        id: true,
        fileCode: true,
        hostThumbnailUrl: true,
        lengthSeconds: true,
      },
    });
    const existingByCode = new Map(
      existing.map((mirror) => [mirror.fileCode, mirror]),
    );

    for (const file of files) {
      const mirror = existingByCode.get(file.code);
      if (!mirror) continue;

      await prisma.mirror.update({
        where: { id: mirror.id },
        data: {
          rawTitle: file.title,
          normalizedName: normalize(file.title),
          embedUrl: provider.embedUrl(file.code),
          hostThumbnailUrl:
            file.thumbnailUrl ?? mirror.hostThumbnailUrl,
          lengthSeconds:
            file.lengthSeconds ?? mirror.lengthSeconds,
          lastCheckedAt: new Date(),
        },
      });
    }

    const existingCodes = new Set(existingByCode.keys());
    const newFiles = files.filter((file) => !existingCodes.has(file.code));

    if (newFiles.length === 0) break;

    for (const file of newFiles) {
      try {
        const attached = await attachPrimaryFileToExistingVideo(
          host.id,
          provider,
          file,
        );

        if (attached) {
          matched += 1;
          continue;
        }

        await createPrimaryVideo(host, provider, file, errors, metadata);
        created += 1;
      } catch (error) {
        errors.push(
          `${host.id} primary file ${file.code}: ${errorMessage(error)}`,
        );
      }
    }

    if (!hasMore) break;
  }

  return { created, matched };
}

async function indexSecondaryHost(
  host: Host,
  provider: HostProvider,
  errors: string[],
): Promise<void> {
  for (let page = 1; ; page += 1) {
    let result;
    try {
      result = await provider.listFiles({
        page,
        perPage: PAGE_SIZE,
      });
    } catch (error) {
      errors.push(`${host.id} list: ${errorMessage(error)}`);
      return;
    }

    for (const file of result.files) {
      await prisma.hostFile.upsert({
        where: {
          hostId_fileCode: {
            hostId: host.id,
            fileCode: file.code,
          },
        },
        create: {
          hostId: host.id,
          fileCode: file.code,
          rawTitle: file.title,
          normalizedName: normalize(file.title),
        },
        update: {
          rawTitle: file.title,
          normalizedName: normalize(file.title),
        },
      });
    }

    if (!result.hasMore || result.files.length === 0) break;
  }
}

export async function runNewVideos(): Promise<SyncJobResult> {
  const run = await prisma.syncRun.create({
    data: {
      kind: "NEW",
      created: 0,
      matched: 0,
      missing: 0,
      errors: [],
    },
  });

  const locked = await withSyncLock("NEW", async () => {
    const errors: string[] = [];
    let created = 0;
    let matched = 0;

    const primary = await prisma.host.findFirst({
      where: {
        enabled: true,
        isPrimary: true,
      },
    });

    if (!primary) {
      errors.push("No enabled primary host is configured");
      return { created, matched, errors };
    }

    const provider = getHostProvider(primary.id);
    if (!provider) {
      errors.push(`No provider registered for primary host ${primary.id}`);
      return { created, matched, errors };
    }

    let metadata = EMPTY_MIGRATION_METADATA;
    try {
      metadata = await loadMigrationMetadata(primary.id);
    } catch (error) {
      errors.push(`migration metadata: ${errorMessage(error)}`);
    }

    try {
      const primaryResult = await syncPrimaryHost(
        primary,
        provider,
        errors,
        metadata,
      );
      created += primaryResult.created;
      matched += primaryResult.matched;
    } catch (error) {
      errors.push(`${primary.id} primary sync: ${errorMessage(error)}`);
    }

    const settings = await getSyncSettings();
    const secondaryHosts = await prisma.host.findMany({
      where: {
        enabled: true,
        isPrimary: false,
      },
      orderBy: { sortOrder: "asc" },
    });

    for (const host of secondaryHosts) {
      const secondaryProvider = hostRegistry.get(host.id);
      if (!secondaryProvider) {
        errors.push(`No provider registered for host ${host.id}`);
        continue;
      }

      await indexSecondaryHost(host, secondaryProvider, errors);

      if (settings.autoMatchEnabled) {
        try {
          matched += await autoMatchHostFiles(
            host.id,
            secondaryProvider,
          );
        } catch (error) {
          errors.push(`${host.id} auto-match: ${errorMessage(error)}`);
        }
      }
    }

    return { created, matched, errors };
  });

  if (!locked.acquired || !locked.value) {
    const finished = await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        errors: ["Another sync run is already active"],
      },
    });
    return { run: finished, skipped: true };
  }

  const finished = await prisma.syncRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      created: locked.value.created,
      matched: locked.value.matched,
      errors: locked.value.errors,
    },
  });

  return { run: finished, skipped: false };
}
