import type { Metadata } from "next";

import { LegalShell } from "../content-removal/LegalShell";

export const metadata: Metadata = {
  title: "Privacy | GayVideo.fun",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy"
      eyebrow="LEGAL"
      sections={[
        { id: "overview", title: "Overview" },
        { id: "information", title: "Information" },
        { id: "choices", title: "Choices" },
        { id: "contact", title: "Contact" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Privacy" },
      ]}
    />
  );
}
