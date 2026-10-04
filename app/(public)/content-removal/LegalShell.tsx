import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/primitives";

import styles from "./legal.module.css";

export type LegalSection = {
  id: string;
  title: string;
  action?: {
    href: string;
    label: string;
  };
  badge?: string;
};

type Props = {
  title: string;
  eyebrow?: string;
  introPlaceholder?: boolean;
  sections: LegalSection[];
  breadcrumbs?: Array<{ label: string; href?: string }>;
  children?: ReactNode;
};

export function LegalPlaceholder() {
  return (
    <div className={styles.legalPlaceholder}>
      <Icon name="gavel" aria-hidden="true" />
      <span>LEGAL COPY — FINAL TEXT REQUIRED</span>
    </div>
  );
}

export function LegalShell({
  title,
  eyebrow,
  introPlaceholder = true,
  sections,
  breadcrumbs = [{ label: "Home", href: "/" }],
  children,
}: Props) {
  return (
    <main className={styles.page}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        {breadcrumbs.map((item, index) => (
          <span key={item.label + "-" + index} className={styles.crumb}>
            {index > 0 ? <span aria-hidden="true">›</span> : null}
            {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
          </span>
        ))}
      </nav>

      <div className={styles.layout}>
        <aside className={styles.toc}>
          <span className={styles.tocLabel}>ON THIS PAGE</span>
          <nav aria-label="On this page">
            {sections.map((section) => (
              <a key={section.id} href={"#" + section.id}>
                {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <article className={styles.article}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1>{title}</h1>
          {introPlaceholder ? <LegalPlaceholder /> : null}

          <nav className={styles.mobileToc} aria-label="On this page">
            <span className={styles.mobileTocLabel} aria-hidden="true">
              <Icon name="swipe" />
              Sections
            </span>
            <div className={styles.mobileTocLinks}>
              {sections.map((section) => (
                <a key={section.id} href={"#" + section.id}>
                  {section.title}
                </a>
              ))}
            </div>
          </nav>

          {children ??
            sections.map((section) => (
              <section id={section.id} key={section.id} className={styles.section}>
                <div className={styles.sectionTitle}>
                  <h2>{section.title}</h2>
                  {section.badge ? <span>{section.badge}</span> : null}
                </div>
                <LegalPlaceholder />
                {section.action ? (
                  <Link className={styles.inlineAction} href={section.action.href}>
                    {section.action.label}
                    <Icon name="arrow_forward" aria-hidden="true" />
                  </Link>
                ) : null}
              </section>
            ))}
        </article>
      </div>
    </main>
  );
}
