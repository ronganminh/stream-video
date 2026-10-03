import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/primitives";

import {
  LegalPlaceholder,
  LegalShell,
  type LegalSection,
} from "./LegalShell";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Copyright & Content Removal | GayVideo.fun",
  alternates: { canonical: "/content-removal" },
  robots: { index: true, follow: true },
};

const sections: LegalSection[] = [
  {
    id: "copyright",
    title: "Copyright complaints",
    action: { href: "/content-removal/dmca", label: "Open DMCA form" },
  },
  {
    id: "removal",
    title: "Content removal requests",
    action: { href: "/content-removal/request", label: "Start removal request" },
  },
  { id: "privacy", title: "Privacy requests" },
  {
    id: "non-consensual",
    title: "Non-consensual content",
    badge: "URGENT",
    action: { href: "/content-removal/request", label: "Start removal request" },
  },
  {
    id: "underage",
    title: "Underage-content reporting",
    badge: "URGENT",
    action: { href: "/content-removal/request", label: "Start removal request" },
  },
  { id: "contact", title: "Contact & submission" },
];

const paths = [
  {
    icon: "copyright",
    title: "Copyright complaint",
    href: "/content-removal/dmca",
    label: "DMCA form",
  },
  {
    icon: "person_remove",
    title: "Remove content of me",
    href: "/content-removal/request",
    label: "Removal request",
  },
  {
    icon: "shield",
    title: "Report a safety concern",
    href: "/content-removal/request",
    label: "Start request",
  },
];

export default function ContentRemovalPage() {
  return (
    <LegalShell
      title="Copyright & Content Removal"
      eyebrow="COPYRIGHT & SAFETY"
      sections={sections}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Copyright & Safety" },
        { label: "Content Removal" },
      ]}
    >
      <div className={styles.pathGrid}>
        {paths.map((path) => (
          <Link href={path.href} className={styles.pathCard} key={path.title}>
            <Icon name={path.icon} />
            <span>
              <strong>{path.title}</strong>
              <small>{path.label}</small>
            </span>
            <Icon name="arrow_forward" />
          </Link>
        ))}
      </div>

      {sections.map((section) => (
        <section id={section.id} key={section.id} className={styles.section}>
          <div className={styles.sectionTitle}>
            <h2>{section.title}</h2>
            {section.badge ? <span>{section.badge}</span> : null}
          </div>
          <LegalPlaceholder />
          {section.action ? (
            <Link className={styles.action} href={section.action.href}>
              {section.action.label}
              <Icon name="arrow_forward" />
            </Link>
          ) : null}
        </section>
      ))}
    </LegalShell>
  );
}
