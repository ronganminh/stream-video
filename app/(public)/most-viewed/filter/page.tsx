import { mostViewedMetadata, MostViewedView, type RawQuery } from "../MostViewedView";

// Filtered or sorted listings, rewritten here. Their query
// combinations are unbounded, so they render per request instead of caching.
export const dynamic = "force-dynamic";

type SearchParams = Promise<RawQuery>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return mostViewedMetadata(await searchParams);
}

export default async function MostViewedFilteredPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <MostViewedView raw={await searchParams} />;
}
