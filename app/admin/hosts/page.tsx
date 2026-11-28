import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NewPlayerDomainsAlert } from "@/components/admin/NewPlayerDomainsAlert";
import { DomainLabelButtons } from "@/components/admin/DomainLabelButtons";
import {
  classifyDomain,
  domainLabels,
  likelyAdDomains,
  listCspReports,
  newPlayerDomains,
} from "@/lib/security/cspReports";

import { HostsForm } from "./HostsForm";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Hosts",
};

export default async function AdminHostsPage() {
  await requireAdmin();

  const [allReports, newDomains, likelyAds, labels] = await Promise.all([
    listCspReports(),
    newPlayerDomains(),
    likelyAdDomains(),
    domainLabels(),
  ]);
  const frameReports = allReports.filter((entry) => entry.directive === "frame-src").slice(0, 50);
  const isNew = new Set(newDomains.map((domain) => domain.host));
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
  const hostOptions = hosts.map((host) => ({ id: host.id, label: host.label }));
  const hostLabel = new Map(hostOptions.map((host) => [host.id, host.label]));
  const kindText = (domain: string) => {
    const label = labels[domain];
    switch (classifyDomain(domain, labels)) {
      case "ignored":
        return "Quảng cáo (bỏ qua)";
      case "player":
        return `Player của ${label?.kind === "player" ? (hostLabel.get(label.hostId) ?? label.hostId) : "host"}`;
      case "likely-ad":
        return "Có thể là quảng cáo";
      default:
        return "Chưa rõ";
    }
  };

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>DELIVERY</p>
      <h1>Hosts</h1>
      <p className={styles.intro}>
        Choose which hosts are enabled, select the source for new videos, and
        set the independent server order shown to viewers.
      </p>
      <NewPlayerDomainsAlert domains={newDomains} likelyAds={likelyAds} hosts={hostOptions} />
      <HostsForm hosts={hosts} />

      <section className={styles.cspReports} aria-labelledby="csp-reports-heading">
        <h2 id="csp-reports-heading">Player domains reported by browsers</h2>
        <p className={styles.intro}>
          Frames outside the known player list (CSP reports). Not an app error: most are
          ad pages the host&apos;s player opens when a viewer clicks. &quot;Report&quot; means the
          video still played; &quot;Blocked&quot; means the browser refused it. Mark each domain as
          an ad (never alerted again) or as a host&apos;s player.
        </p>
        {frameReports.length ? (
          <table>
            <thead>
              <tr>
                <th scope="col">Domain</th>
                <th scope="col">Kind</th>
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
                    {isNew.has(entry.blocked) ? <strong className={styles.newBadge}> mới</strong> : null}
                  </td>
                  <td>
                    {kindText(entry.blocked)}
                    {labels[entry.blocked] ? null : <DomainLabelButtons domain={entry.blocked} hosts={hostOptions} />}
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
