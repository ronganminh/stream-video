import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAdminAudit } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

import styles from "./page.module.css";

const syncSchema = z.object({
  kind: z.enum(["NEW", "HEALTH"]),
});

async function requestSyncAction(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const parsed = syncSchema.safeParse({
    kind: formData.get("kind"),
  });
  if (!parsed.success) return;

  const request = await db.syncRequest.create({
    data: { kind: parsed.data.kind },
  });
  await writeAdminAudit(
    admin.id,
    "SYNC_REQUEST",
    `${parsed.data.kind}:${request.id}`,
  );
  revalidatePath("/admin");
}

function formatAdminTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(value);
}

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [hosts, drafts, published, removed, uncategorized, openReports, lastSync] =
    await Promise.all([
      db.host.findMany({
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, label: true, isPrimary: true },
      }),
      db.video.count({
        where: { isPublished: false, isHidden: false },
      }),
      db.video.count({
        where: { isPublished: true, isHidden: false },
      }),
      db.video.count({
        where: { status: "REMOVED" },
      }),
      db.video.count({
        where: { categoryId: null },
      }),
      db.report.count({
        where: { status: { not: "RESOLVED" } },
      }),
      db.syncRun.findFirst({
        orderBy: { startedAt: "desc" },
      }),
    ]);

  const missingByHost = await Promise.all(
    hosts.map(async (host) => ({
      ...host,
      missing: await db.video.count({
        where: {
          mirrors: {
            none: {
              hostId: host.id,
              status: "OK",
            },
          },
        },
      }),
    })),
  );
  const primaryMissing =
    missingByHost.find((host) => host.isPrimary)?.missing ?? 0;

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>ADMIN OVERVIEW</p>
          <h1>Dashboard</h1>
        </div>
        <div className={styles.syncActions}>
          <form action={requestSyncAction}>
            <input type="hidden" name="kind" value="NEW" />
            <button type="submit">Sync now</button>
          </form>
          <form action={requestSyncAction}>
            <input type="hidden" name="kind" value="HEALTH" />
            <button className={styles.secondary} type="submit">
              Health check
            </button>
          </form>
        </div>
      </div>

      <section className={styles.stats} aria-label="Video status counts">
        <article><span>Drafts waiting</span><strong>{drafts}</strong></article>
        <article><span>Published</span><strong>{published}</strong></article>
        <article><span>Primary missing</span><strong>{primaryMissing}</strong></article>
        <article><span>Removed</span><strong>{removed}</strong></article>
        <article><span>Uncategorized</span><strong>{uncategorized}</strong></article>
        <article><span>Open reports</span><strong>{openReports}</strong></article>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Missing mirrors</h2>
            <span>Enabled hosts</span>
          </div>
          {missingByHost.length ? (
            <div className={styles.rows}>
              {missingByHost.map((host) => (
                <div className={styles.row} key={host.id}>
                  <span>
                    {host.label}
                    {host.isPrimary ? <em>Primary</em> : null}
                  </span>
                  <strong>{host.missing}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.muted}>No enabled hosts.</p>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Last sync</h2>
            <span>{lastSync?.kind ?? "—"}</span>
          </div>
          {lastSync ? (
            <dl className={styles.syncMeta}>
              <div>
                <dt>Started</dt>
                <dd>
                  <time
                    dateTime={lastSync.startedAt.toISOString()}
                    title={lastSync.startedAt.toISOString()}
                  >
                    {formatAdminTimestamp(lastSync.startedAt)}
                  </time>
                </dd>
              </div>
              <div><dt>Created</dt><dd>{lastSync.created}</dd></div>
              <div><dt>Matched</dt><dd>{lastSync.matched}</dd></div>
              <div><dt>Missing</dt><dd>{lastSync.missing}</dd></div>
              <div>
                <dt>Status</dt>
                <dd>{lastSync.finishedAt ? "Finished" : "Running"}</dd>
              </div>
            </dl>
          ) : (
            <p className={styles.muted}>No sync runs yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}
