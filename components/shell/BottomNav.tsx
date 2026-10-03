"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/primitives";

import styles from "./BottomNav.module.css";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "home", match: ["/"] },
  { href: "/hot", label: "Hot", icon: "local_fire_department", match: ["/hot"] },
  { href: "/search", label: "Search", icon: "search", match: ["/search"] },
  { href: "/categories", label: "Categories", icon: "grid_view", match: ["/categories", "/category/", "/tag/"] },
] as const;

const MORE_LINKS = [
  { href: "/latest", label: "Latest" },
  { href: "/most-viewed", label: "Most Viewed" },
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

export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/watch")) return null;

  const moreActive = MORE_LINKS.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <nav className={styles.root} aria-label="Mobile primary navigation">
        <div className={styles.inner}>
          {NAV_ITEMS.map((item) => {
            const active = matchesPath(pathname, item.match);
            return (
              <Link key={item.href} className={styles.item} data-active={active || undefined} href={item.href} aria-current={active ? "page" : undefined}>
                <Icon name={item.icon} className={styles.icon} />
                <span className={styles.label}>{item.label}</span>
                <span className={styles.indicator} aria-hidden="true" />
              </Link>
            );
          })}
          <details className={styles.more}>
            <summary className={styles.item} data-active={moreActive || undefined} aria-label="More navigation">
              <Icon name="more_horiz" className={styles.icon} />
              <span className={styles.label}>More</span>
              <span className={styles.indicator} aria-hidden="true" />
            </summary>
            <div className={styles.morePanel}>
              {MORE_LINKS.map((item) => <Link key={item.href} className={styles.moreLink} href={item.href}>{item.label}</Link>)}
            </div>
          </details>
        </div>
      </nav>
    </>
  );
}
