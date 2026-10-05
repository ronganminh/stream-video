import { readFile } from "node:fs/promises";

import { prisma } from "../db";
import { normalize } from "./normalize";

type CsvRow = Record<string, string>;

export type MigrationMetadataIndex = {
  tagsByHostCode: Map<string, string[]>;
};

export const EMPTY_MIGRATION_METADATA: MigrationMetadataIndex = {
  tagsByHostCode: new Map(),
};

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
  const videosPath = process.env.MIGRATION_VIDEOS_CSV;
  const logPath = process.env.MIGRATION_LOG_CSV;
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
  const hostCodeField = `${primaryHostId}_file_code`;

  for (const row of parseCsv(logContent)) {
    const postId = row.post_id;
    const hostCode = row[hostCodeField]?.trim();
    if (!postId || !hostCode) continue;

    const tags = splitTags(sourceByPostId.get(postId)?.tags);
    if (tags.length > 0) tagsByHostCode.set(hostCode, tags);
  }

  return { tagsByHostCode };
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
