import { categoryMetadata, CategoryView } from "../CategoryView";

// Served from the ISR cache; ?page=n and filters are rewritten to sibling
// routes (see lib/isr/listRoutes).
export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }) {
  return categoryMetadata((await params).slug, {});
}

export default async function CategoryPage({ params }: { params: Params }) {
  return <CategoryView slug={(await params).slug} raw={{}} />;
}
