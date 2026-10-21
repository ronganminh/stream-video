import { hotMetadata, HotView, type RawQuery } from "../HotView";

// Filtered or sorted listings, rewritten here. Their query
// combinations are unbounded, so they render per request instead of caching.
export const dynamic = "force-dynamic";

type SearchParams = Promise<RawQuery>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return hotMetadata(await searchParams);
}

export default async function HotFilteredPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <HotView raw={await searchParams} />;
}
