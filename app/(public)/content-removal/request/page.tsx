import type { Metadata } from "next";

import { LegalPlaceholder, LegalShell } from "../LegalShell";
import { RemovalRequestForm } from "./RemovalRequestForm";

export const metadata: Metadata = {
  title: "Request removal | GayVideo.fun",
  alternates: { canonical: "/content-removal/request" },
  robots: { index: false, follow: true },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function carriedVideo(params: Record<string, string | string[] | undefined>) {
  const value = params.video;
  if (typeof value !== "string" || value.length > 2000) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export default async function RemovalRequestPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const initialVideoUrl = carriedVideo(await searchParams);

  return (
    <LegalShell
      title="Request removal"
      eyebrow="CONTENT REMOVAL"
      introPlaceholder={false}
      sections={[
        { id: "request", title: "Request" },
        { id: "privacy", title: "Privacy" },
        { id: "contact", title: "Contact" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Content Removal", href: "/content-removal" },
        { label: "Request removal" },
      ]}
    >
      <LegalPlaceholder />
      <RemovalRequestForm initialVideoUrl={initialVideoUrl} />
    </LegalShell>
  );
}
