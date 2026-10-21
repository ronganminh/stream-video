import { hotMetadata, HotView } from "./HotView";

// Served from the ISR cache; ?page=n and filters are rewritten to sibling
// routes (see lib/isr/listRoutes).
export const revalidate = 120;

export function generateMetadata() {
  return hotMetadata({});
}

export default function HotPage() {
  return <HotView raw={{}} />;
}
