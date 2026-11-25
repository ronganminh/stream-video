import { NextResponse, type NextRequest } from "next/server";

import { AGE_GATE_CONFIRMED_HASH } from "@/lib/ageGate";
import { db } from "@/lib/db";
import { internalListRedirect } from "@/lib/isr/listRoutes";
import { redirectedVideoSlug } from "@/lib/videoSlugs";
import {
  AGE_GATE_COOKIE_NAME,
  getAgeGateCookieLifetimeDays,
} from "@/lib/settings/ageGate";

const AGE_GATE_ACTION_FIELD = "_gv_age_gate";
const AGE_GATE_ACTION_VALUE = "acknowledge";
const SECONDS_PER_DAY = 24 * 60 * 60;

async function watchStatusResponse(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }

  const match = request.nextUrl.pathname.match(/^\/watch\/([^/]+)$/);
  if (!match) return null;

  const slug = decodeURIComponent(match[1]);
  if (slug === "_gone") return null;

  const video = await db.video.findUnique({
    where: { slug },
    select: {
      status: true,
      isPublished: true,
      isHidden: true,
    },
  });

  if (!video) {
    // An old slug of a video whose slug was changed: 301 to the current one.
    const current = await redirectedVideoSlug(db, slug);
    if (!current) return null;
    const destination = request.nextUrl.clone();
    destination.pathname = `/watch/${current}`;
    return NextResponse.redirect(destination, 301);
  }

  if (!video.isPublished || video.isHidden) {
    return new NextResponse(null, { status: 404 });
  }

  const status = video.status;

  if (status !== "REMOVED" && status !== "BLOCKED") {
    return null;
  }

  return goneResponse(request, slug);
}

/**
 * The /watch/_gone page with a 410 status. Middleware cannot rewrite with a
 * status, so the page is fetched from this same server. Not through
 * request.nextUrl: behind Caddy it carries the public "https:" scheme with
 * the container's own host, and a TLS request to that plain-HTTP port fails
 * ("wrong version number"), which turned every removed video into a 500.
 * The forwarded host/proto are passed on so the page builds public links.
 * Whatever happens, the answer stays a 410.
 */
function goneFetchUrl(slug: string, port = process.env.PORT || "3000"): string {
  return `http://127.0.0.1:${port}/watch/_gone?slug=${encodeURIComponent(slug)}`;
}

async function goneResponse(request: NextRequest, slug: string) {
  const headers = new Headers();
  for (const name of ["cookie", "x-forwarded-host", "x-forwarded-proto", "host"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name === "host" ? "x-forwarded-host" : name, value);
  }
  if (!headers.has("x-forwarded-proto")) headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));

  try {
    const rendered = await fetch(goneFetchUrl(slug), {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    const contentType = rendered.headers.get("content-type") ?? "text/html; charset=utf-8";
    const body = request.method === "HEAD" ? null : await rendered.text();
    return new NextResponse(body, {
      status: 410,
      headers: {
        "content-type": contentType,
        "cache-control": rendered.headers.get("cache-control") ?? "private, no-cache",
      },
    });
  } catch (error) {
    console.error("watch 410 page could not be rendered", error);
    return new NextResponse(
      request.method === "HEAD"
        ? null
        : '<!doctype html><meta charset="utf-8"><title>Video removed</title><p>This video has been removed.</p><p><a href="/">GayVideo.fun</a></p>',
      { status: 410, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-cache" } },
    );
  }
}

// List pages are routed by next.config rewrites (lib/isr/listRoutes); this
// only redirects direct visits to their internal routes.
function listRedirect(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const target = internalListRedirect(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
  );
  if (!target) return null;

  const destination = request.nextUrl.clone();
  destination.pathname = target.pathname;
  destination.search = target.search;
  return NextResponse.redirect(destination, 308);
}

export async function middleware(request: NextRequest) {
  const watchResponse = await watchStatusResponse(request);
  if (watchResponse) return watchResponse;

  const list = listRedirect(request);
  if (list) return list;

  if (request.method !== "POST") {
    return NextResponse.next();
  }

  const contentType = request.headers.get("content-type") ?? "";
  const isForm =
    contentType.startsWith("application/x-www-form-urlencoded") ||
    contentType.startsWith("multipart/form-data");

  if (!isForm) {
    return NextResponse.next();
  }

  let formData: FormData;

  try {
    formData = await request.clone().formData();
  } catch {
    return NextResponse.next();
  }

  if (formData.get(AGE_GATE_ACTION_FIELD) !== AGE_GATE_ACTION_VALUE) {
    return NextResponse.next();
  }

  const cookieLifetimeDays = await getAgeGateCookieLifetimeDays();
  // Pages are cached and identical for everyone, so the server can't hide the
  // gate for this visitor. With JS the cookie hides it on every page; without
  // JS the fragment hides it on the page they return to (CSS :target).
  const destination = request.nextUrl.clone();
  destination.hash = AGE_GATE_CONFIRMED_HASH;
  const response = NextResponse.redirect(destination, 303);

  response.cookies.set(AGE_GATE_COOKIE_NAME, "1", {
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    ...(cookieLifetimeDays === null
      ? {}
      : { maxAge: cookieLifetimeDays * SECONDS_PER_DAY }),
  });

  return response;
}

export const config = {
  runtime: "nodejs",
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
