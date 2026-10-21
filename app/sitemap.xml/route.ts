import {
  sitemapIndexXml,
  videoSitemapIndexEntries,
  xmlResponse,
} from "@/lib/seo/sitemaps";

export const dynamic = "force-dynamic";

export async function GET() {
  return xmlResponse(
    sitemapIndexXml([
      ...(await videoSitemapIndexEntries()),
      { path: "/sitemaps/categories.xml" },
      { path: "/sitemaps/tags.xml" },
      { path: "/sitemaps/static.xml" },
    ]),
  );
}
