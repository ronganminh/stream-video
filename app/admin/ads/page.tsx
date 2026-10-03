import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AD_SLOT_KEYS } from "@/lib/data/prisma/ads";

import { ensureAdSlots, saveAdSlotAction } from "./actions";
import styles from "./page.module.css";

const slotDescriptions: Record<(typeof AD_SLOT_KEYS)[number], string> = {
  "home-leaderboard": "Home page leaderboard placement.",
  "list-in-feed": "Desktop/tablet in-feed list placement.",
  "watch-below-player": "Watch page placement directly below the player.",
  "watch-sidebar": "Watch page sidebar placement.",
  "mobile-in-feed": "Mobile in-feed placement.",
};

export default async function AdminAdsPage() {
  await requireAdmin();
  await ensureAdSlots();

  const slots = await db.adSlot.findMany({
    where: {
      key: { in: [...AD_SLOT_KEYS] },
    },
  });
  const byKey = new Map(slots.map((slot) => [slot.key, slot]));

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>MONETIZATION</p>
          <h1>Ad slots</h1>
          <p className={styles.intro}>
            Each stable slot has one HTML snippet and one enabled flag.
            Disabled or empty slots collapse on public pages.
          </p>
        </div>
        <div className={styles.links}>
          <Link href="/admin/reports">Reports</Link>
          <Link href="/admin/requests">Requests</Link>
          <Link href="/admin/sync">Sync log</Link>
        </div>
      </div>

      <div className={styles.list}>
        {AD_SLOT_KEYS.map((key) => {
          const slot = byKey.get(key);

          return (
            <section className={styles.card} key={key}>
              <div className={styles.cardHeading}>
                <div>
                  <h2>{key}</h2>
                  <p>{slotDescriptions[key]}</p>
                </div>
                <span>{slot?.enabled ? "Enabled" : "Disabled"}</span>
              </div>

              <form className={styles.form} action={saveAdSlotAction}>
                <input type="hidden" name="key" value={key} />
                <label className={styles.toggle}>
                  <input
                    name="enabled"
                    type="checkbox"
                    defaultChecked={slot?.enabled ?? false}
                  />
                  <span>Enable this ad slot</span>
                </label>

                <label className={styles.field}>
                  <span>HTML snippet</span>
                  <textarea
                    name="html"
                    rows={8}
                    maxLength={20000}
                    defaultValue={slot?.html ?? ""}
                    spellCheck={false}
                  />
                  <small>
                    Public pages receive HTML only when this slot is enabled
                    and the snippet is not blank.
                  </small>
                </label>

                <div className={styles.actions}>
                  <button type="submit">Save slot</button>
                </div>
              </form>
            </section>
          );
        })}
      </div>
    </main>
  );
}
