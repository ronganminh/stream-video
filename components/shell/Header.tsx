import Link from "next/link";

import { Icon } from "@/components/primitives";

import { SearchBox } from "./SearchBox";
import styles from "./Header.module.css";

const PRIMARY_LINKS = [
  { href: "/", label: "Home" },
  { href: "/latest", label: "Latest" },
  { href: "/hot", label: "Hot" },
  { href: "/most-viewed", label: "Most Viewed" },
  { href: "/categories", label: "Categories" },
] as const;

const MORE_LINKS = [
  { href: "/content-removal", label: "Content Removal" },
  { href: "/content-removal/dmca", label: "DMCA" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
] as const;

function Brand() {
  return (
    <span className={styles.brand} aria-label="GayVideo.fun">
      <svg className={styles.mark} width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="gv-header-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--gv-violet)" />
            <stop offset="1" stopColor="var(--gv-magenta)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#gv-header-logo)" />
        <path d="M22.6 10.2A8.6 8.6 0 1 0 24.6 16.5H20" fill="none" stroke="var(--gv-text)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.2 12.6v7.2l5.6-3.6z" fill="var(--gv-text)" stroke="var(--gv-text)" strokeWidth="1" strokeLinejoin="round" />
      </svg>
      <span className={styles.wordmark}>GayVideo<span>.fun</span></span>
    </span>
  );
}

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.logoLink} href="/" aria-label="GayVideo.fun home"><Brand /></Link>

        <nav className={styles.nav} aria-label="Primary navigation">
          {PRIMARY_LINKS.map((item) => <Link key={item.href} className={styles.navLink} href={item.href}>{item.label}</Link>)}
        </nav>

        <SearchBox />

        <div className={styles.actions}>
          <span className={styles.adults}>18+</span>
          <span className={styles.language} aria-label="Language: English"><Icon name="language" className={styles.languageIcon} />EN</span>

          <details className={styles.more}>
            <summary className={styles.moreButton} aria-label="More navigation"><Icon name="menu" className={styles.menuIcon} /></summary>
            <div className={styles.menuPanel}>
              <nav className={styles.collapsedNav} aria-label="More primary navigation">
                {PRIMARY_LINKS.map((item) => <Link key={item.href} className={styles.menuLink} href={item.href}>{item.label}</Link>)}
              </nav>
              <span className={styles.menuLanguage}><Icon name="language" className={styles.languageIcon} />English</span>
              <div className={styles.menuDivider} />
              {MORE_LINKS.map((item) => <Link key={item.href} className={styles.menuLink} href={item.href}>{item.label}</Link>)}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
