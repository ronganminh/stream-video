import "server-only";

import { db } from "@/lib/db";

export const AD_SLOT_KEYS = [
  "home-leaderboard",
  "list-in-feed",
  "watch-below-player",
  "watch-sidebar",
  "mobile-in-feed",
] as const;

export type AdSlotKey = (typeof AD_SLOT_KEYS)[number];

export async function getAdHtml(
  key: AdSlotKey,
): Promise<string | null> {
  const slot = await db.adSlot.findUnique({
    where: { key },
    select: {
      enabled: true,
      html: true,
    },
  });

  if (!slot?.enabled) return null;

  const html = slot.html.trim();
  return html ? html : null;
}
