import { notFound } from "next/navigation";

import { listPageNumber } from "@/lib/isr/listRoutes";

import { mostViewedMetadata, MostViewedView } from "../../MostViewedView";

// /most-viewed?page=n, rewritten here so each page is cached.
export const revalidate = 300;

type Params = Promise<{ page: string }>;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }) {
  const page = listPageNumber((await params).page);
  return page ? mostViewedMetadata({ page: String(page) }) : {};
}

export default async function MostViewedPagedPage({ params }: { params: Params }) {
  const page = listPageNumber((await params).page);
  if (!page) notFound();
  return <MostViewedView raw={{ page: String(page) }} />;
}
