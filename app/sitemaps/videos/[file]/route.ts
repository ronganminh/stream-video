import {
  sitemapXml,
  videoSitemapEntries,
  videoSitemapPageCount,
  xmlResponse,
} from "@/lib/seo/sitemaps";

export const dynamic = "force-dynamic";

type Params = Promise<{ file: string }>;

// /sitemaps/videos/1.xml, /sitemaps/videos/2.xml, … listed by /sitemap.xml.
export async function GET(_request: Request, { params }: { params: Params }) {
  const match = /^([1-9]\d{0,4})\.xml$/.exec((await params).file);
  const page = match ? Number(match[1]) : 0;

  if (!page || page > (await videoSitemapPageCount())) {
    return new Response("Not found", { status: 404 });
  }

  return xmlResponse(sitemapXml(await videoSitemapEntries(page)));
}
