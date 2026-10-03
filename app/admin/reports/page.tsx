import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

import {
  hideVideoAndResolveAction,
  resolveReportAction,
} from "./actions";
import styles from "./page.module.css";

export default async function AdminReportsPage() {
  await requireAdmin();

  const reports = await db.report.findMany({
    orderBy: [
      { urgent: "desc" },
      { createdAt: "asc" },
    ],
    include: {
      video: {
        select: {
          id: true,
          title: true,
          slug: true,
          isHidden: true,
        },
      },
    },
    take: 200,
  });

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>OPERATIONS</p>
          <h1>Reports</h1>
          <p className={styles.intro}>
            Urgent reports are shown first. Resolve the report or hide the
            related video and resolve it in one action.
          </p>
        </div>
        <div className={styles.links}>
          <Link href="/admin/requests">Requests</Link>
          <Link href="/admin/ads">Ads</Link>
          <Link href="/admin/sync">Sync log</Link>
        </div>
      </div>

      <div className={styles.queue}>
        {reports.map((report) => (
          <article
            className={report.urgent ? styles.urgentCard : styles.card}
            key={report.id}
          >
            <div className={styles.cardHeading}>
              <div>
                <div className={styles.badges}>
                  {report.urgent ? <span>Urgent</span> : null}
                  <span>{report.reason}</span>
                  <span>{report.status}</span>
                </div>
                <h2>{report.video.title}</h2>
                <code>{report.pageUrl}</code>
              </div>
              <time dateTime={report.createdAt.toISOString()}>
                {report.createdAt.toISOString()}
              </time>
            </div>

            <dl className={styles.meta}>
              <div><dt>Video</dt><dd>{report.video.slug}</dd></div>
              <div><dt>Hidden</dt><dd>{report.video.isHidden ? "Yes" : "No"}</dd></div>
              <div><dt>Contact</dt><dd>{report.contactEmail ?? "—"}</dd></div>
              <div><dt>Details</dt><dd>{report.details ?? "—"}</dd></div>
            </dl>

            <div className={styles.actions}>
              <Link href={`/admin/videos/${report.video.id}`}>
                Open video
              </Link>
              {report.status !== "RESOLVED" ? (
                <>
                  <form action={resolveReportAction}>
                    <input type="hidden" name="id" value={report.id} />
                    <button type="submit">Resolve</button>
                  </form>
                  <form action={hideVideoAndResolveAction}>
                    <input type="hidden" name="id" value={report.id} />
                    <button className={styles.danger} type="submit">
                      Hide video + resolve
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </article>
        ))}

        {!reports.length ? (
          <section className={styles.empty}>
            <h2>No reports</h2>
            <p>The report queue is empty.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
