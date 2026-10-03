import {
  sitemapXml,
  videoSitemapEntries,
} from "@/lib/seo/sitemaps";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(sitemapXml(await videoSitemapEntries()), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
