import { latestMetadata, LatestView, type RawQuery } from "../LatestView";

// Filtered or sorted listings, rewritten here. Their query
// combinations are unbounded, so they render per request instead of caching.
export const dynamic = "force-dynamic";

type SearchParams = Promise<RawQuery>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return latestMetadata(await searchParams);
}

export default async function LatestFilteredPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <LatestView raw={await searchParams} />;
}
