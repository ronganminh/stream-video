import type { Metadata } from "next";

import { LegalShell } from "../content-removal/LegalShell";

export const metadata: Metadata = {
  title: "Cookies | GayVideo.fun",
  alternates: { canonical: "/cookies" },
  robots: { index: true, follow: true },
};

export default function CookiesPage() {
  return (
    <LegalShell
      title="Cookies"
      eyebrow="LEGAL"
      sections={[
        { id: "overview", title: "Overview" },
        { id: "preferences", title: "Preferences" },
        { id: "details", title: "Details" },
        { id: "contact", title: "Contact" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Cookies" },
      ]}
    />
  );
}
