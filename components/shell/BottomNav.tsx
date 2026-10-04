"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/primitives";

import styles from "./BottomNav.module.css";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "home", match: ["/"] },
  { href: "/hot", label: "Hot", icon: "local_fire_department", match: ["/hot"] },
  { href: "/search", label: "Search", icon: "search", match: ["/search"] },
  { href: "/categories", label: "Categories", icon: "grid_view", match: ["/categories", "/category/", "/tag/"] },
] as const;

const MORE_LINKS = [
  { href: "/latest", label: "Latest", match: ["/latest"] },
  { href: "/most-viewed", label: "Most Viewed", match: ["/most-viewed"] },
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

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

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

  if (pathname.startsWith("/watch")) return null;

  const moreActive = MORE_LINKS.some((item) =>
    matchesPath(pathname, item.match),
  );

  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <nav className={styles.root} aria-label="Mobile primary navigation">
        <div className={styles.inner}>
          {NAV_ITEMS.map((item) => {
            const active = matchesPath(pathname, item.match);
            return (
              <Link
                key={item.href}
                className={styles.item}
                data-active={active || undefined}
                href={item.href}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} className={styles.icon} />
                <span className={styles.label}>{item.label}</span>
                <span className={styles.indicator} aria-hidden="true" />
              </Link>
            );
          })}
          <div className={styles.more} data-open={moreOpen || undefined}>
            <button
              ref={moreButtonRef}
              type="button"
              className={styles.item}
              data-active={moreActive || undefined}
              aria-label="More navigation"
              aria-expanded={moreOpen}
              aria-controls="gv-bottom-more-navigation"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <Icon name="more_horiz" className={styles.icon} />
              <span className={styles.label}>More</span>
              <span className={styles.indicator} aria-hidden="true" />
            </button>
            {moreOpen ? (
              <div className={styles.morePanel} id="gv-bottom-more-navigation">
                {MORE_LINKS.map((item) => {
                  const active = matchesPath(pathname, item.match);
                  return (
                    <Link
                      key={item.href}
                      className={styles.moreLink}
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
      </nav>
    </>
  );
}
