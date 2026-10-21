import { latestMetadata, LatestView } from "./LatestView";

// Served from the ISR cache; ?page=n and filters are rewritten to sibling
// routes (see lib/isr/listRoutes).
export const revalidate = 60;

export function generateMetadata() {
  return latestMetadata({});
}

export default function LatestPage() {
  return <LatestView raw={{}} />;
}
