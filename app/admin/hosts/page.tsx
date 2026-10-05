import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

import { HostsForm } from "./HostsForm";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Hosts",
};

export default async function AdminHostsPage() {
  await requireAdmin();

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
    </main>
  );
}
