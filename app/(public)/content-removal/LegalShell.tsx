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

function fallbackCopy(title: string, sectionTitle?: string) {
  const page = title.toLowerCase();
  const section = sectionTitle?.toLowerCase();

  if (page.includes("privacy")) {
    if (section?.includes("information")) return "We collect only the information needed to operate the service, process safety requests, prevent abuse, and respond to legal notices.";
    if (section?.includes("choices")) return "You can contact us about privacy concerns, removal requests, or data questions using the content-removal and safety request forms.";
    return "This page explains how GayVideo.fun handles privacy, safety reports, and operational data for adult users.";
  }

  if (page.includes("cookies")) {
    if (section?.includes("preferences")) return "Cookie preferences are used for essential site behavior such as age-gate acknowledgement, session security, and basic usability.";
    if (section?.includes("details")) return "Essential cookies support login, safety controls, and site operation. Optional analytics or advertising cookies should be used only where configured.";
    return "This page explains the cookies and similar browser storage used by GayVideo.fun.";
  }

  if (page.includes("removal") || page.includes("copyright")) {
    if (section?.includes("copyright")) return "Copyright owners or authorized representatives can submit a notice identifying the protected work and the reported GayVideo.fun URLs.";
    if (section?.includes("privacy") || section?.includes("content removal")) return "People shown in content, or people reporting private or non-consensual material, can request review and removal through the safety forms.";
    if (section?.includes("underage")) return "Reports involving possible underage content are treated as urgent and should include every URL and detail that helps locate the material quickly.";
    if (section?.includes("contact")) return "Use the linked request forms so the review team receives the required URLs, contact email, declarations, and supporting details.";
    return "GayVideo.fun reviews copyright, privacy, safety, non-consensual-content, and underage-content reports through dedicated request forms.";
  }

  if (page.includes("terms")) {
    if (section?.includes("use")) return "GayVideo.fun is for adults only. Users must follow applicable law, respect rights holders and depicted persons, and avoid abusive behavior.";
    if (section?.includes("content")) return "Content may be removed, restricted, or reviewed when it is reported, unavailable, unlawful, non-consensual, or otherwise violates site rules.";
    if (section?.includes("contact")) return "For legal, privacy, copyright, or safety concerns, use the content-removal and DMCA request pages linked from the footer.";
    return "These terms describe the rules for using GayVideo.fun, an adults-only video discovery and streaming service.";
  }

  return "This section explains the policy, request process, and contact path for this page.";
}

export function LegalCopy({ title, sectionTitle }: { title: string; sectionTitle?: string }) {
  return (
    <div className={styles.legalPlaceholder}>
      <Icon name="gavel" aria-hidden="true" />
      <span>{fallbackCopy(title, sectionTitle)}</span>
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
          {introPlaceholder ? <LegalCopy title={title} /> : null}

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
                <LegalCopy title={title} sectionTitle={section.title} />
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
