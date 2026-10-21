import { notFound } from "next/navigation";

import { listPageNumber } from "@/lib/isr/listRoutes";

import { hotMetadata, HotView } from "../../HotView";

// /hot?page=n, rewritten here so each page is cached.
export const revalidate = 120;

type Params = Promise<{ page: string }>;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }) {
  const page = listPageNumber((await params).page);
  return page ? hotMetadata({ page: String(page) }) : {};
}

export default async function HotPagedPage({ params }: { params: Params }) {
  const page = listPageNumber((await params).page);
  if (!page) notFound();
  return <HotView raw={{ page: String(page) }} />;
}
