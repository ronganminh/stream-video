import { prisma } from "../db";
import { storeThumbnail } from "./thumbnails";

const SOURCE_PREFIX = "video-source-thumbnail:";
const SELECTED_PREFIX = "video-thumbnail-selected:";

export type ThumbnailPreference = {
  sourceUrl: string | null;
  selected: string | null;
};

export function sourceThumbnailSettingKey(videoId: string): string {
  return `${SOURCE_PREFIX}${videoId}`;
}

export function selectedThumbnailSettingKey(videoId: string): string {
  return `${SELECTED_PREFIX}${videoId}`;
}

export function normalizeRemoteThumbnailUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Thumbnail URL must use http or https.");
  }
  return url.toString();
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function loadThumbnailPreferences(
  videoIds: string[],
): Promise<Map<string, ThumbnailPreference>> {
  const uniqueIds = [...new Set(videoIds.filter(Boolean))];
  const preferences = new Map<string, ThumbnailPreference>();

  for (const videoId of uniqueIds) {
    preferences.set(videoId, {
      sourceUrl: null,
      selected: null,
    });
  }

  if (uniqueIds.length === 0) {
    return preferences;
  }

  const sourceKeys = uniqueIds.map(sourceThumbnailSettingKey);
  const selectedKeys = uniqueIds.map(selectedThumbnailSettingKey);
  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: [...sourceKeys, ...selectedKeys],
      },
    },
    select: {
      key: true,
      value: true,
    },
  });

  for (const setting of settings) {
    if (setting.key.startsWith(SOURCE_PREFIX)) {
      const videoId = setting.key.slice(SOURCE_PREFIX.length);
      const current = preferences.get(videoId);
      if (current) {
        current.sourceUrl = stringValue(setting.value);
      }
      continue;
    }

    if (setting.key.startsWith(SELECTED_PREFIX)) {
      const videoId = setting.key.slice(SELECTED_PREFIX.length);
      const current = preferences.get(videoId);
      if (current) {
        current.selected = stringValue(setting.value);
      }
    }
  }

  return preferences;
}

export async function applySourceThumbnail(
  videoId: string,
  sourceUrl: string,
): Promise<string> {
  const normalizedUrl = normalizeRemoteThumbnailUrl(sourceUrl);
  const thumbnailPath = await storeThumbnail({
    url: normalizedUrl,
    videoId,
  });

  if (!thumbnailPath) {
    throw new Error("Source thumbnail conversion failed.");
  }

  await prisma.$transaction([
    prisma.video.update({
      where: { id: videoId },
      data: { thumbnailPath },
    }),
    prisma.setting.upsert({
      where: { key: sourceThumbnailSettingKey(videoId) },
      create: {
        key: sourceThumbnailSettingKey(videoId),
        value: normalizedUrl,
      },
      update: {
        value: normalizedUrl,
      },
    }),
    prisma.setting.upsert({
      where: { key: selectedThumbnailSettingKey(videoId) },
      create: {
        key: selectedThumbnailSettingKey(videoId),
        value: "source",
      },
      update: {
        value: "source",
      },
    }),
  ]);

  return thumbnailPath;
}

export async function applyThumbnailSelection(
  videoId: string,
  selection: string,
): Promise<string> {
  let remoteUrl: string | null = null;

  if (selection === "source") {
    const setting = await prisma.setting.findUnique({
      where: { key: sourceThumbnailSettingKey(videoId) },
      select: { value: true },
    });
    remoteUrl = stringValue(setting?.value);
  } else {
    const mirror = await prisma.mirror.findUnique({
      where: {
        videoId_hostId: {
          videoId,
          hostId: selection,
        },
      },
      select: {
        hostThumbnailUrl: true,
        status: true,
      },
    });

    if (mirror?.status === "OK") {
      remoteUrl = mirror.hostThumbnailUrl;
    }
  }

  if (!remoteUrl) {
    throw new Error("Thumbnail choice is not available.");
  }

  const normalizedUrl = normalizeRemoteThumbnailUrl(remoteUrl);
  const thumbnailPath = await storeThumbnail({
    url: normalizedUrl,
    videoId,
  });

  if (!thumbnailPath) {
    throw new Error("Thumbnail conversion failed.");
  }

  await prisma.$transaction([
    prisma.video.update({
      where: { id: videoId },
      data: { thumbnailPath },
    }),
    prisma.setting.upsert({
      where: { key: selectedThumbnailSettingKey(videoId) },
      create: {
        key: selectedThumbnailSettingKey(videoId),
        value: selection,
      },
      update: {
        value: selection,
      },
    }),
  ]);

  return thumbnailPath;
}
