import { tagMetadata, TagView } from "../TagView";

// Served from the ISR cache; ?page=n and filters are rewritten to sibling
// routes (see lib/isr/listRoutes).
export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }) {
  return tagMetadata((await params).slug, {});
}

export default async function TagPage({ params }: { params: Params }) {
  return <TagView slug={(await params).slug} raw={{}} />;
}
