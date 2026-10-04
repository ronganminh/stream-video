"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { Icon } from "@/components/primitives";

import { SearchBox } from "./SearchBox";
import styles from "./Header.module.css";

const PRIMARY_LINKS = [
  { href: "/", label: "Home", match: ["/"] },
  { href: "/latest", label: "Latest", match: ["/latest"] },
  { href: "/hot", label: "Hot", match: ["/hot"] },
  { href: "/most-viewed", label: "Most Viewed", match: ["/most-viewed"] },
  { href: "/categories", label: "Categories", match: ["/categories", "/category/", "/tag/"] },
] as const;

const MORE_LINKS = [
  { href: "/content-removal", label: "Content Removal" },
  { href: "/content-removal/dmca", label: "DMCA" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
] as const;

function matchesPath(pathname: string, matchers: readonly string[]): boolean {
  return matchers.some((matcher) => {
    if (matcher === "/") return pathname === "/";
    if (matcher.endsWith("/")) return pathname.startsWith(matcher);
    return pathname === matcher || pathname.startsWith(`${matcher}/`);
  });
}

function matchesHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

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

export function PublicContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const needsShellMain = pathname === "/" || pathname.startsWith("/watch/");

  return needsShellMain ? <main>{children}</main> : <>{children}</>;
}

export function Header() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const primaryActive = PRIMARY_LINKS.some((item) =>
    matchesPath(pathname, item.match),
  );
  const moreActive = MORE_LINKS.some((item) => matchesHref(pathname, item.href));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMoreOpen(false);
      requestAnimationFrame(() => moreButtonRef.current?.focus());
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen]);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.logoLink} href="/" aria-label="GayVideo.fun home">
          <Brand />
        </Link>

        <nav className={styles.nav} aria-label="Primary navigation">
          {PRIMARY_LINKS.map((item) => {
            const active = matchesPath(pathname, item.match);
            return (
              <Link
                key={item.href}
                className={styles.navLink}
                data-active={active || undefined}
                href={item.href}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <SearchBox />

        <div className={styles.actions}>
          <span className={styles.adults}>18+</span>
          <span className={styles.language} aria-label="Language: English">
            <Icon name="language" className={styles.languageIcon} />
            EN
          </span>

          <div className={styles.more} data-open={moreOpen || undefined}>
            <button
              ref={moreButtonRef}
              type="button"
              className={styles.moreButton}
              aria-label="More navigation"
              aria-expanded={moreOpen}
              aria-controls="gv-header-more-navigation"
              data-active={moreActive || undefined}
              data-collapsed-active={primaryActive || undefined}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <Icon name="menu" className={styles.menuIcon} />
            </button>
            {moreOpen ? (
              <div className={styles.menuPanel} id="gv-header-more-navigation">
                <nav className={styles.collapsedNav} aria-label="More primary navigation">
                  {PRIMARY_LINKS.map((item) => {
                    const active = matchesPath(pathname, item.match);
                    return (
                      <Link
                        key={item.href}
                        className={styles.menuLink}
                        data-active={active || undefined}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMoreOpen(false)}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
                <span className={styles.menuLanguage}>
                  <Icon name="language" className={styles.languageIcon} />
                  English
                </span>
                <div className={styles.menuDivider} />
                {MORE_LINKS.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      className={styles.menuLink}
                      data-active={active || undefined}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMoreOpen(false)}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
