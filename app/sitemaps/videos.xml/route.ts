// Video URLs moved to paginated video sitemaps listed by /sitemap.xml; keep
// this address working for anything that still points at it.
export function GET(request: Request) {
  return Response.redirect(new URL("/sitemap.xml", request.url), 301);
}
