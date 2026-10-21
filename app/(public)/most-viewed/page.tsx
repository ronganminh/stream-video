import { mostViewedMetadata, MostViewedView } from "./MostViewedView";

// Served from the ISR cache; ?page=n and filters are rewritten to sibling
// routes (see lib/isr/listRoutes).
export const revalidate = 300;

export function generateMetadata() {
  return mostViewedMetadata({});
}

export default function MostViewedPage() {
  return <MostViewedView raw={{}} />;
}
