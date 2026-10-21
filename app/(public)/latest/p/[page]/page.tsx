import { notFound } from "next/navigation";

import { listPageNumber } from "@/lib/isr/listRoutes";

import { latestMetadata, LatestView } from "../../LatestView";

// /latest?page=n, rewritten here so each page is cached.
export const revalidate = 60;

type Params = Promise<{ page: string }>;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }) {
  const page = listPageNumber((await params).page);
  return page ? latestMetadata({ page: String(page) }) : {};
}

export default async function LatestPagedPage({ params }: { params: Params }) {
  const page = listPageNumber((await params).page);
  if (!page) notFound();
  return <LatestView raw={{ page: String(page) }} />;
}
