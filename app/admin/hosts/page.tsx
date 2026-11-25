import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listCspReports } from "@/lib/security/cspReports";

import { HostsForm } from "./HostsForm";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Hosts",
};

export default async function AdminHostsPage() {
  await requireAdmin();

  const frameReports = (await listCspReports()).filter((entry) => entry.directive === "frame-src").slice(0, 50);
  const hosts = await db.host.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      label: true,
      enabled: true,
      isPrimary: true,
      sortOrder: true,
    },
  });

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>DELIVERY</p>
      <h1>Hosts</h1>
      <p className={styles.intro}>
        Choose which hosts are enabled, select the source for new videos, and
        set the independent server order shown to viewers.
      </p>
      <HostsForm hosts={hosts} />

      <section className={styles.cspReports} aria-labelledby="csp-reports-heading">
        <h2 id="csp-reports-heading">Player domains reported by browsers</h2>
        <p className={styles.intro}>
          Frames outside the known player list (CSP reports). &quot;Report&quot; means the
          video still played; &quot;Blocked&quot; means the browser refused it. A new domain
          of a host can be added to its <code>embedDomains</code>.
        </p>
        {frameReports.length ? (
          <table>
            <thead>
              <tr>
                <th scope="col">Domain</th>
                <th scope="col">Result</th>
                <th scope="col">Count</th>
                <th scope="col">Last seen (UTC)</th>
                <th scope="col">Page</th>
              </tr>
            </thead>
            <tbody>
              {frameReports.map((entry) => (
                <tr key={`${entry.disposition} ${entry.blocked}`}>
                  <td>
                    <code>{entry.blocked}</code>
                  </td>
                  <td>{entry.disposition === "enforce" ? "Blocked" : "Report"}</td>
                  <td>{entry.count}</td>
                  <td>{entry.lastAt.slice(0, 16).replace("T", " ")}</td>
                  <td>{entry.page}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No reports yet.</p>
        )}
      </section>
    </main>
  );
}
