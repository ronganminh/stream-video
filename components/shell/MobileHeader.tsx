import Link from "next/link";

import { Icon } from "@/components/primitives";

import { MobileSearch } from "./MobileSearch";
import styles from "./MobileHeader.module.css";

const MENU_LINKS = [
  { href: "/", label: "Home" },
  { href: "/latest", label: "Latest" },
  { href: "/hot", label: "Hot" },
  { href: "/most-viewed", label: "Most Viewed" },
  { href: "/categories", label: "Categories" },
  { href: "/content-removal", label: "Content Removal" },
  { href: "/content-removal/dmca", label: "DMCA" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
] as const;

function MobileBrand() {
  return (
    <span className={styles.brand} aria-label="GayVideo.fun">
      <svg className={styles.mark} width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="gv-mobile-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--gv-violet)" />
            <stop offset="1" stopColor="var(--gv-magenta)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#gv-mobile-logo)" />
        <path d="M22.6 10.2A8.6 8.6 0 1 0 24.6 16.5H20" fill="none" stroke="var(--gv-text)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.2 12.6v7.2l5.6-3.6z" fill="var(--gv-text)" />
      </svg>
      <span className={styles.wordmark}>GayVideo<span>.fun</span></span>
    </span>
  );
}

export function MobileHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.logoLink} href="/" aria-label="GayVideo.fun home"><MobileBrand /></Link>
        <div className={styles.actions}>
          <MobileSearch />
          <details className={styles.menu}>
            <summary className={styles.iconButton} aria-label="Open navigation menu"><Icon name="menu" className={styles.icon} /></summary>
            <nav className={styles.menuPanel} aria-label="Mobile navigation">
              {MENU_LINKS.map((item) => <Link key={item.href} className={styles.menuLink} href={item.href}>{item.label}</Link>)}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
