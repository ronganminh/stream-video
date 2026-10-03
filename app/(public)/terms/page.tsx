import type { Metadata } from "next";

import { LegalShell } from "../content-removal/LegalShell";

export const metadata: Metadata = {
  title: "Terms | GayVideo.fun",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms"
      eyebrow="LEGAL"
      sections={[
        { id: "overview", title: "Overview" },
        { id: "use", title: "Use" },
        { id: "content", title: "Content" },
        { id: "contact", title: "Contact" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Terms" },
      ]}
    />
  );
}
