import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/lib/auth/actions";
import { getCurrentAdmin } from "@/lib/auth/session";

import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: {
    default: "Admin | GayVideo.fun",
    template: "%s | Admin | GayVideo.fun",
  },
  robots: {
    index: false,
    follow: false,
  },
};

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/videos", label: "Videos" },
  { href: "/admin/hosts", label: "Hosts" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export default async function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return children;
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/admin">
          GayVideo.fun
          <span>Admin</span>
        </Link>
        <nav className={styles.nav} aria-label="Admin navigation">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.account}>
          <span>{admin.email}</span>
          <form action={logoutAction}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
