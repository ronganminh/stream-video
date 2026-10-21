// Public list pages are served from the ISR cache. A route that reads
// searchParams can't be cached, so next.config rewrites map the public URLs
// (/latest, /latest?page=2, /latest?sort=views…) onto internal routes:
//
//   /latest                 -> /latest            (ISR)
//   /latest?page=n          -> /latest/p/n        (ISR, one entry per page)
//   /latest?<any filter>    -> /latest/filter?…   (rendered per request)
//
// Filters stay uncached on purpose: their combinations are unbounded, and an
// ISR entry per combination would let crawlers fill the disk.
//
// These must be next.config `beforeFiles` rewrites, not middleware rewrites:
// Next only treats a middleware-rewritten request as ISR when the target path
// was prerendered at build time, so /latest/p/n would always render per
// request.

type ListRoute = {
  source: string;
  filters: readonly string[];
};

const LIST_ROUTES: readonly ListRoute[] = [
  { source: "/latest", filters: ["category", "duration", "date", "tag", "sort"] },
  { source: "/hot", filters: ["window"] },
  { source: "/most-viewed", filters: ["window", "sort"] },
  { source: "/category/:slug", filters: ["sort", "duration", "date"] },
  { source: "/tag/:slug", filters: ["sort", "duration", "date"] },
];

// Page numbers from 2 up, no leading zeros, at most six digits.
const PAGE_VALUE = "(?<page>[2-9]|[1-9]\\d{1,5})";

type QueryCondition = { type: "query"; key: string; value?: string };

export type ListRewrite = {
  source: string;
  destination: string;
  has?: QueryCondition[];
  missing?: QueryCondition[];
};

export function listRewrites(): ListRewrite[] {
  return LIST_ROUTES.flatMap(({ source, filters }) => [
    // Any filter present, even empty, renders per request with the query.
    ...filters.map((key) => ({
      source,
      has: [{ type: "query" as const, key }],
      destination: `${source}/filter`,
    })),
    {
      source,
      has: [{ type: "query" as const, key: "page", value: PAGE_VALUE }],
      missing: filters.map((key) => ({ type: "query" as const, key })),
      destination: `${source}/p/:page`,
    },
  ]);
}

/** A list page number worth its own cache entry: an integer from 2 up. */
export function listPageNumber(value: string | undefined | null): number | null {
  if (!value || !new RegExp(`^${PAGE_VALUE}$`).test(value)) return null;
  return Number(value);
}

function sourcePattern(source: string): RegExp {
  return new RegExp(`^${source.replace(/:slug/g, "[^/]+")}$`);
}

const INTERNAL_PAGE = /^(.*)\/p\/([^/]+)$/;
const INTERNAL_FILTER = /^(.*)\/filter$/;

function isListPath(pathname: string): boolean {
  return LIST_ROUTES.some(({ source }) => sourcePattern(source).test(pathname));
}

/**
 * Internal list routes are only meant to be reached through the rewrites, so
 * send direct visits to the public URL and keep one address per listing.
 */
export function internalListRedirect(
  pathname: string,
  params: URLSearchParams,
): { pathname: string; search: string } | null {
  const paged = INTERNAL_PAGE.exec(pathname);
  if (paged && isListPath(paged[1])) {
    const page = listPageNumber(paged[2]);
    return { pathname: paged[1], search: page ? `page=${page}` : "" };
  }

  const filtered = INTERNAL_FILTER.exec(pathname);
  if (filtered && isListPath(filtered[1])) {
    return { pathname: filtered[1], search: params.toString() };
  }

  return null;
}
