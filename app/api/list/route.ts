import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  getCategory,
  getHot,
  getLatest,
  getMostViewed,
  getTag,
} from "@/lib/data";
import type { ListQuery } from "@/lib/types";

type ListTarget =
  | { kind: "hot" }
  | { kind: "most-viewed" }
  | { kind: "latest" }
  | { kind: "category"; slug: string }
  | { kind: "tag"; slug: string };

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseQuery(searchParams: URLSearchParams): ListQuery {
  return {
    window: searchParams.get("window") || undefined,
    sort: searchParams.get("sort") || undefined,
    duration: searchParams.get("duration") || undefined,
    date: searchParams.get("date") || undefined,
    category: searchParams.get("category") || undefined,
    tag: searchParams.get("tag") || undefined,
    page: parsePositiveInt(searchParams.get("page")),
  };
}

function targetFromPath(pathname: string): ListTarget | null {
  if (pathname === "/hot" || pathname.startsWith("/hot/")) return { kind: "hot" };
  if (pathname === "/most-viewed" || pathname.startsWith("/most-viewed/")) {
    return { kind: "most-viewed" };
  }
  if (pathname === "/latest" || pathname.startsWith("/latest/")) return { kind: "latest" };

  const categoryMatch = pathname.match(/^\/category\/([^/?#]+)/);
  if (categoryMatch?.[1]) {
    return { kind: "category", slug: decodeURIComponent(categoryMatch[1]) };
  }

  const tagMatch = pathname.match(/^\/tag\/([^/?#]+)/);
  if (tagMatch?.[1]) {
    return { kind: "tag", slug: decodeURIComponent(tagMatch[1]) };
  }

  return null;
}

function resolveTarget(request: NextRequest): ListTarget {
  const { searchParams } = request.nextUrl;
  const explicit = searchParams.get("type") ?? searchParams.get("list") ?? searchParams.get("pageType");
  const slug = searchParams.get("slug");

  if (explicit === "hot") return { kind: "hot" };
  if (explicit === "most-viewed" || explicit === "mostViewed") return { kind: "most-viewed" };
  if (explicit === "latest") return { kind: "latest" };
  if (explicit === "category" && (slug || searchParams.get("category"))) {
    return { kind: "category", slug: slug ?? searchParams.get("category")! };
  }
  if (explicit === "tag" && (slug || searchParams.get("tag"))) {
    return { kind: "tag", slug: slug ?? searchParams.get("tag")! };
  }

  const explicitPath = searchParams.get("path") ?? searchParams.get("pathname");
  if (explicitPath) {
    const fromPath = targetFromPath(explicitPath);
    if (fromPath) return fromPath;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const fromReferer = targetFromPath(new URL(referer).pathname);
      if (fromReferer) return fromReferer;
    } catch {
      // Ignore malformed Referer values and fall back to Latest.
    }
  }

  return { kind: "latest" };
}

export async function GET(request: NextRequest) {
  const target = resolveTarget(request);
  const query = parseQuery(request.nextUrl.searchParams);

  if (target.kind === "hot") {
    return NextResponse.json(await getHot(query));
  }

  if (target.kind === "most-viewed") {
    return NextResponse.json(await getMostViewed(query));
  }

  if (target.kind === "category") {
    const result = await getCategory(target.slug, query);
    if (!result) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    return NextResponse.json(result.videos);
  }

  if (target.kind === "tag") {
    const result = await getTag(target.slug, query);
    if (!result) return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    return NextResponse.json(result.videos);
  }

  return NextResponse.json(await getLatest(query));
}
