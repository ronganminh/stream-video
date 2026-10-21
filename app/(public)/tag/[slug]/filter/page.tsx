import { tagMetadata, TagView, type RawQuery } from "../TagView";

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
  return tagMetadata(slug, raw);
}

export default async function TagFilteredPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  return <TagView slug={slug} raw={raw} />;
}
