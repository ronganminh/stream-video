import {
  categorySitemapEntries,
  sitemapXml,
} from "@/lib/seo/sitemaps";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(sitemapXml(await categorySitemapEntries()), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
