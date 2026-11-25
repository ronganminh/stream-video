import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { DEFAULT_CAPTION_TEMPLATE, LEGACY_CAPTION_TEMPLATE, defaultCaption } from "./captionRules";
import { X_NETWORK } from "./queue";
import { CAPTION_TEMPLATE_SETTING, getXCaptionSettings } from "./settings";

// November 2026: the default X caption became the title alone, instead of
// "New video: {title} 🔥". Run on every deploy (idempotent): it moves the
// saved template and the captions of posts not yet in Buffer that are exactly
// the old default; anything an admin typed differs and is left alone.

/** Posts whose caption can still change: Buffer has not received them. */
const NOT_IN_BUFFER = ["preparing", "waiting", "queued"] as const;

export type CaptionUpgrade = {
  /** The saved template: moved from the old default, kept (custom), or none saved. */
  setting: "upgraded" | "custom" | "default" | "unset";
  posts: number;
  checked: number;
};

export async function upgradeLegacyCaptions(
  options: { apply?: boolean; client?: PrismaClient } = {},
): Promise<CaptionUpgrade> {
  const client = options.client ?? prisma;
  const apply = options.apply !== false;

  const saved = await client.setting.findUnique({ where: { key: CAPTION_TEMPLATE_SETTING } });
  let setting: CaptionUpgrade["setting"] = "unset";
  if (saved) {
    const value = typeof saved.value === "string" ? saved.value.trim() : "";
    if (value === LEGACY_CAPTION_TEMPLATE) {
      setting = "upgraded";
      if (apply) {
        await client.setting.update({
          where: { key: CAPTION_TEMPLATE_SETTING },
          data: { value: DEFAULT_CAPTION_TEMPLATE },
        });
      }
    } else {
      setting = value === DEFAULT_CAPTION_TEMPLATE ? "default" : "custom";
    }
  }

  const { bannedExtra } = await getXCaptionSettings(client);
  const posts = await client.socialPost.findMany({
    where: { network: X_NETWORK, status: { in: [...NOT_IN_BUFFER] } },
    select: { id: true, caption: true, status: true, video: { select: { title: true } } },
  });
  let changed = 0;
  for (const post of posts) {
    const legacy = defaultCaption(LEGACY_CAPTION_TEMPLATE, post.video.title, bannedExtra);
    const next = defaultCaption(DEFAULT_CAPTION_TEMPLATE, post.video.title, bannedExtra);
    if (post.caption !== legacy || legacy === next) continue;
    changed += 1;
    if (apply) {
      // Same status guard: a post that reached Buffer meanwhile keeps its text.
      await client.socialPost.updateMany({
        where: { id: post.id, caption: legacy, status: { in: [...NOT_IN_BUFFER] } },
        data: { caption: next },
      });
    }
  }
  return { setting, posts: changed, checked: posts.length };
}
