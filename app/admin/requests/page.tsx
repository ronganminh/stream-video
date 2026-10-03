import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

import { updateRemovalRequestAction } from "./actions";
import styles from "./page.module.css";

function prettyPayload(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

export default async function AdminRequestsPage() {
  await requireAdmin();

  const requests = await db.removalRequest.findMany({
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>OPERATIONS</p>
          <h1>Removal requests</h1>
          <p className={styles.intro}>
            Review DMCA and removal submissions, add internal notes, and
            track each request through resolution.
          </p>
        </div>
        <div className={styles.links}>
          <Link href="/admin/reports">Reports</Link>
          <Link href="/admin/ads">Ads</Link>
          <Link href="/admin/sync">Sync log</Link>
        </div>
      </div>

      <div className={styles.queue}>
        {requests.map((request) => (
          <article className={styles.card} key={request.id}>
            <div className={styles.cardHeading}>
              <div>
                <div className={styles.badges}>
                  <span>{request.type}</span>
                  <span>{request.status}</span>
                </div>
                <h2>{request.id}</h2>
              </div>
              <time dateTime={request.createdAt.toISOString()}>
                {request.createdAt.toISOString()}
              </time>
            </div>

            <pre className={styles.payload}>
              {prettyPayload(request.payload)}
            </pre>

            <form className={styles.form} action={updateRemovalRequestAction}>
              <input type="hidden" name="id" value={request.id} />
              <label className={styles.field}>
                <span>Status</span>
                <select name="status" defaultValue={request.status}>
                  <option value="OPEN">Open</option>
                  <option value="IN_REVIEW">In review</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Internal notes</span>
                <textarea
                  name="notes"
                  rows={4}
                  maxLength={4000}
                  defaultValue={request.notes ?? ""}
                />
              </label>
              <div className={styles.actions}>
                <button type="submit">Save request</button>
              </div>
            </form>
          </article>
        ))}

        {!requests.length ? (
          <section className={styles.empty}>
            <h2>No removal requests</h2>
            <p>The request queue is empty.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
