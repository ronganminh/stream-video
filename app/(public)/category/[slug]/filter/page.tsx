import { categoryMetadata, CategoryView, type RawQuery } from "../CategoryView";

// Filtered or sorted listings, rewritten here. Their query
// combinations are unbounded, so they render per request instead of caching.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<RawQuery>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  return categoryMetadata(slug, raw);
}

export default async function CategoryFilteredPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  return <CategoryView slug={slug} raw={raw} />;
}
