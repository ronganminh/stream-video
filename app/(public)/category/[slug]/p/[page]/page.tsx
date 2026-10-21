import { notFound } from "next/navigation";

import { listPageNumber } from "@/lib/isr/listRoutes";

import { categoryMetadata, CategoryView } from "../../CategoryView";

// /category/<slug>?page=n, rewritten here so each page is cached.
export const revalidate = 300;

type Params = Promise<{ slug: string; page: string }>;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }) {
  const { slug, page } = await params;
  const number = listPageNumber(page);
  return number ? categoryMetadata(slug, { page: String(number) }) : {};
}

export default async function CategoryPagedPage({ params }: { params: Params }) {
  const { slug, page } = await params;
  const number = listPageNumber(page);
  if (!number) notFound();
  return <CategoryView slug={slug} raw={{ page: String(number) }} />;
}
