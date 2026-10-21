import {
  categorySitemapEntries,
  sitemapXml,
  xmlResponse,
} from "@/lib/seo/sitemaps";

export const dynamic = "force-dynamic";

export async function GET() {
  return xmlResponse(sitemapXml(await categorySitemapEntries()));
}
