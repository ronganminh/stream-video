import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

import styles from "./page.module.css";

function formatErrors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) =>
    typeof item === "string" ? item : JSON.stringify(item),
  );
}

export default async function AdminSyncLogPage() {
  await requireAdmin();

  const runs = await db.syncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>OPERATIONS</p>
          <h1>Sync log</h1>
          <p className={styles.intro}>
            Inspect recent NEW and HEALTH runs, counters, duration and
            recorded errors.
          </p>
        </div>
        <div className={styles.links}>
          <Link href="/admin/reports">Reports</Link>
          <Link href="/admin/requests">Requests</Link>
          <Link href="/admin/ads">Ads</Link>
        </div>
      </div>

      <div className={styles.list}>
        {runs.map((run) => {
          const errors = formatErrors(run.errors);
          const durationMs = run.finishedAt
            ? run.finishedAt.getTime() - run.startedAt.getTime()
            : null;

          return (
            <article className={styles.card} key={run.id}>
              <div className={styles.cardHeading}>
                <div className={styles.titleLine}>
                  <strong>{run.kind}</strong>
                  <span>{run.finishedAt ? "Finished" : "Running"}</span>
                  {errors.length ? (
                    <span className={styles.errorBadge}>
                      {errors.length} error{errors.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                <code>{run.id}</code>
              </div>

              <dl className={styles.stats}>
                <div><dt>Started</dt><dd>{run.startedAt.toISOString()}</dd></div>
                <div><dt>Finished</dt><dd>{run.finishedAt?.toISOString() ?? "—"}</dd></div>
                <div><dt>Duration</dt><dd>{durationMs === null ? "—" : `${durationMs} ms`}</dd></div>
                <div><dt>Created</dt><dd>{run.created}</dd></div>
                <div><dt>Matched</dt><dd>{run.matched}</dd></div>
                <div><dt>Missing</dt><dd>{run.missing}</dd></div>
              </dl>

              {errors.length ? (
                <details className={styles.errors}>
                  <summary>Error details</summary>
                  <ol>
                    {errors.map((error, index) => (
                      <li key={`${run.id}-${index}`}>
                        <code>{error}</code>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </article>
          );
        })}

        {!runs.length ? (
          <section className={styles.empty}>
            <h2>No sync runs</h2>
            <p>Sync history will appear here after the worker runs.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
