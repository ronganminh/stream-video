import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { DEFAULT_CAPTION_TEMPLATE } from "./captionRules";

// Caption settings for X posts approved in /admin/review, editable in
// /admin/settings (stored in the Setting table, no deploy needed).

export const CAPTION_TEMPLATE_SETTING = "social.x.captionTemplate";
export const BANNED_EXTRA_SETTING = "social.x.bannedExtra";

export type XCaptionSettings = {
  /** "{title}" is replaced by the video title without accents. */
  template: string;
  /** Extra banned words, on top of BANNED_WORDS. */
  bannedExtra: string[];
};

export function parseWordList(value: unknown): string[] {
  const text = Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const word = raw.trim();
    if (word && !seen.has(word.toLowerCase())) {
      seen.add(word.toLowerCase());
      out.push(word);
    }
  }
  return out.slice(0, 200);
}

export async function getXCaptionSettings(client: PrismaClient = prisma): Promise<XCaptionSettings> {
  const rows = await client.setting.findMany({
    where: { key: { in: [CAPTION_TEMPLATE_SETTING, BANNED_EXTRA_SETTING] } },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const template = byKey.get(CAPTION_TEMPLATE_SETTING);
  return {
    template: typeof template === "string" && template.trim() ? template : DEFAULT_CAPTION_TEMPLATE,
    bannedExtra: parseWordList(byKey.get(BANNED_EXTRA_SETTING)),
  };
}

export async function saveXCaptionSettings(
  settings: XCaptionSettings,
  client: PrismaClient = prisma,
): Promise<void> {
  const template = settings.template.trim() || DEFAULT_CAPTION_TEMPLATE;
  await client.$transaction([
    client.setting.upsert({
      where: { key: CAPTION_TEMPLATE_SETTING },
      create: { key: CAPTION_TEMPLATE_SETTING, value: template },
      update: { value: template },
    }),
    client.setting.upsert({
      where: { key: BANNED_EXTRA_SETTING },
      create: { key: BANNED_EXTRA_SETTING, value: settings.bannedExtra },
      update: { value: settings.bannedExtra },
    }),
  ]);
}
