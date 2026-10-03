import { sitemapIndexXml } from "@/lib/seo/sitemaps";

export const dynamic = "force-dynamic";

export function GET() {
  const xml = sitemapIndexXml([
    "/sitemaps/videos.xml",
    "/sitemaps/categories.xml",
    "/sitemaps/tags.xml",
    "/sitemaps/static.xml",
  ]);

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
