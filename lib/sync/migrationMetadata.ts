import { access, readFile } from "node:fs/promises";

import { prisma } from "../db";
import { normalize } from "./normalize";

type CsvRow = Record<string, string>;

// docker-compose mounts ./migration-data at /app/migration-data in the worker,
// so the scheduled sync can pick up tags and source thumbnails with no extra
// configuration when that data is present.
const DEFAULT_VIDEOS_CSV = "/app/migration-data/videos.csv";
const DEFAULT_LOG_CSV = "/app/migration-data/migration-log.csv";

export type MigrationMetadataIndex = {
  tagsByHostCode: Map<string, string[]>;
  sourceThumbnailByHostCode: Map<string, string>;
};

export const EMPTY_MIGRATION_METADATA: MigrationMetadataIndex = {
  tagsByHostCode: new Map(),
  sourceThumbnailByHostCode: new Map(),
};

async function resolveCsvPath(
  configured: string | undefined,
  fallback: string,
): Promise<string | null> {
  if (configured) return configured;
  try {
    await access(fallback);
    return fallback;
  } catch {
    return null;
  }
}

function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  if (!header) return [];

  return body
    .filter((values) => values.some((value) => value.trim()))
    .map((values) =>
      Object.fromEntries(
        header.map((key, index) => [key.trim(), values[index] ?? ""]),
      ),
    );
}

function splitTags(value: string | undefined): string[] {
  if (!value) return [];

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const item of value.split(/[;,]/)) {
    const tag = item.replace(/\s+/g, " ").trim();
    const key = normalize(tag);
    if (!tag || !key || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

export async function loadMigrationMetadata(
  primaryHostId: string,
): Promise<MigrationMetadataIndex> {
  const videosPath = await resolveCsvPath(
    process.env.MIGRATION_VIDEOS_CSV,
    DEFAULT_VIDEOS_CSV,
  );
  const logPath = await resolveCsvPath(
    process.env.MIGRATION_LOG_CSV,
    DEFAULT_LOG_CSV,
  );
  if (!videosPath || !logPath) return EMPTY_MIGRATION_METADATA;

  const [videosContent, logContent] = await Promise.all([
    readFile(videosPath, "utf8"),
    readFile(logPath, "utf8"),
  ]);

  const sourceByPostId = new Map(
    parseCsv(videosContent)
      .filter((row) => row.post_id)
      .map((row) => [row.post_id, row]),
  );

  const tagsByHostCode = new Map<string, string[]>();
  const sourceThumbnailByHostCode = new Map<string, string>();
  const hostCodeField = `${primaryHostId}_file_code`;

  for (const row of parseCsv(logContent)) {
    const postId = row.post_id;
    const hostCode = row[hostCodeField]?.trim();
    if (!postId || !hostCode) continue;

    const source = sourceByPostId.get(postId);

    const tags = splitTags(source?.tags);
    if (tags.length > 0) tagsByHostCode.set(hostCode, tags);

    const thumbnailUrl = source?.thumbnail_url?.trim();
    if (thumbnailUrl && /^https?:\/\//i.test(thumbnailUrl)) {
      sourceThumbnailByHostCode.set(hostCode, thumbnailUrl);
    }
  }

  return { tagsByHostCode, sourceThumbnailByHostCode };
}

export type MigrationEntry = {
  postId: string;
  title: string;
  tags: string[];
  sourceThumbnailUrl: string | null;
};

// Full per-video migration metadata keyed by the primary host's file code,
// used by the backfill command to repair videos that were imported before the
// CSVs were available on the server.
export async function loadMigrationEntriesByHostCode(
  primaryHostId: string,
): Promise<Map<string, MigrationEntry>> {
  const videosPath = await resolveCsvPath(
    process.env.MIGRATION_VIDEOS_CSV,
    DEFAULT_VIDEOS_CSV,
  );
  const logPath = await resolveCsvPath(
    process.env.MIGRATION_LOG_CSV,
    DEFAULT_LOG_CSV,
  );

  const entries = new Map<string, MigrationEntry>();
  if (!videosPath || !logPath) return entries;

  const [videosContent, logContent] = await Promise.all([
    readFile(videosPath, "utf8"),
    readFile(logPath, "utf8"),
  ]);

  const sourceByPostId = new Map(
    parseCsv(videosContent)
      .filter((row) => row.post_id)
      .map((row) => [row.post_id, row]),
  );

  const hostCodeField = `${primaryHostId}_file_code`;

  for (const row of parseCsv(logContent)) {
    const postId = row.post_id;
    const hostCode = row[hostCodeField]?.trim();
    if (!postId || !hostCode) continue;

    const source = sourceByPostId.get(postId);
    if (!source) continue;

    const thumbnailUrl = source.thumbnail_url?.trim();
    entries.set(hostCode, {
      postId,
      title: (source.title ?? "").trim(),
      tags: splitTags(source.tags),
      sourceThumbnailUrl:
        thumbnailUrl && /^https?:\/\//i.test(thumbnailUrl)
          ? thumbnailUrl
          : null,
    });
  }

  return entries;
}

export async function tagConnectData(names: string[]) {
  const unique = new Map<string, string>();
  for (const name of names) {
    const slug = normalize(name).replace(/\s+/g, "-");
    if (slug && !unique.has(slug)) unique.set(slug, name);
  }

  if (unique.size === 0) return [];

  const existing = await prisma.tag.findMany({
    where: { slug: { in: [...unique.keys()] } },
    select: { id: true, slug: true },
  });
  const existingBySlug = new Map(
    existing.map((tag) => [tag.slug, tag.id]),
  );

  const tagIds: string[] = [];
  for (const [slug, name] of unique.entries()) {
    const existingId = existingBySlug.get(slug);
    if (existingId) {
      tagIds.push(existingId);
      continue;
    }

    const created = await prisma.tag.create({
      data: { slug, name },
      select: { id: true },
    });
    tagIds.push(created.id);
  }

  return tagIds.map((tagId) => ({ tagId }));
}
