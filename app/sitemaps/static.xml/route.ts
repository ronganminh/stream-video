import {
  sitemapXml,
  staticSitemapEntries,
} from "@/lib/seo/sitemaps";

export function GET() {
  return new Response(sitemapXml(staticSitemapEntries()), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
