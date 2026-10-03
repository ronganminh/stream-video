import type { Metadata } from "next";

import { LegalPlaceholder, LegalShell } from "../LegalShell";
import { DMCAForm } from "./DMCAForm";

export const metadata: Metadata = {
  title: "Copyright notice | GayVideo.fun",
  alternates: { canonical: "/content-removal/dmca" },
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

export default async function DmcaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const initialVideoUrl = carriedVideo(await searchParams);

  return (
    <LegalShell
      title="Copyright notice"
      eyebrow="CONTENT REMOVAL"
      introPlaceholder={false}
      sections={[
        { id: "details", title: "Your details" },
        { id: "work", title: "The work" },
        { id: "declarations", title: "Declarations" },
      ]}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Content Removal", href: "/content-removal" },
        { label: "DMCA notice" },
      ]}
    >
      <LegalPlaceholder />
      <DMCAForm initialVideoUrl={initialVideoUrl} />
    </LegalShell>
  );
}
