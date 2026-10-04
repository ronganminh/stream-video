"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/primitives";

import { MobileSearch } from "./MobileSearch";
import styles from "./MobileHeader.module.css";

const MENU_LINKS = [
  { href: "/", label: "Home", match: ["/"] },
  { href: "/latest", label: "Latest", match: ["/latest"] },
  { href: "/hot", label: "Hot", match: ["/hot"] },
  { href: "/most-viewed", label: "Most Viewed", match: ["/most-viewed"] },
  { href: "/categories", label: "Categories", match: ["/categories", "/category/", "/tag/"] },
  { href: "/content-removal", label: "Content Removal", match: ["/content-removal", "/content-removal/request"] },
  { href: "/content-removal/dmca", label: "DMCA", match: ["/content-removal/dmca"] },
  { href: "/terms", label: "Terms", match: ["/terms"] },
  { href: "/privacy", label: "Privacy", match: ["/privacy"] },
  { href: "/cookies", label: "Cookies", match: ["/cookies"] },
] as const;

function matchesPath(pathname: string, matchers: readonly string[]): boolean {
  return matchers.some((matcher) => {
    if (matcher === "/") return pathname === "/";
    if (matcher.endsWith("/")) return pathname.startsWith(matcher);
    return pathname === matcher || pathname.startsWith(`${matcher}/`);
  });
}

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
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      requestAnimationFrame(() => menuButtonRef.current?.focus());
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.logoLink} href="/" aria-label="GayVideo.fun home">
          <MobileBrand />
        </Link>
        <div className={styles.actions}>
          <MobileSearch />
          <div className={styles.menu} data-open={menuOpen || undefined}>
            <button
              ref={menuButtonRef}
              type="button"
              className={styles.iconButton}
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={menuOpen}
              aria-controls="gv-mobile-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name={menuOpen ? "close" : "menu"} className={styles.icon} />
            </button>
            {menuOpen ? (
              <nav
                className={styles.menuPanel}
                id="gv-mobile-navigation"
                aria-label="Mobile navigation"
              >
                {MENU_LINKS.map((item) => {
                  const active = matchesPath(pathname, item.match);
                  return (
                    <Link
                      key={item.href}
                      className={styles.menuLink}
                      data-active={active || undefined}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
