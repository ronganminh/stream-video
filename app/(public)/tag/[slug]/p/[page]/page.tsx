import { notFound } from "next/navigation";

import { listPageNumber } from "@/lib/isr/listRoutes";

import { tagMetadata, TagView } from "../../TagView";

// /tag/<slug>?page=n, rewritten here so each page is cached.
export const revalidate = 300;

type Params = Promise<{ slug: string; page: string }>;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }) {
  const { slug, page } = await params;
  const number = listPageNumber(page);
  return number ? tagMetadata(slug, { page: String(number) }) : {};
}

export default async function TagPagedPage({ params }: { params: Params }) {
  const { slug, page } = await params;
  const number = listPageNumber(page);
  if (!number) notFound();
  return <TagView slug={slug} raw={{ page: String(number) }} />;
}
