import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
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

  if (!video) return null;

  if (!video.isPublished || video.isHidden) {
    return new NextResponse(null, { status: 404 });
  }

  const status = video.status;

  if (status !== "REMOVED" && status !== "BLOCKED") {
    return null;
  }

  const destination = request.nextUrl.clone();
  destination.pathname = "/watch/_gone";
  destination.search = "";
  destination.searchParams.set("slug", slug);

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  const rendered = await fetch(destination, {
    method: "GET",
    headers,
  });
  const contentType =
    rendered.headers.get("content-type") ?? "text/html; charset=utf-8";
  const body = request.method === "HEAD" ? null : await rendered.text();

  return new NextResponse(body, {
    status: 410,
    headers: {
      "content-type": contentType,
      "cache-control":
        rendered.headers.get("cache-control") ?? "private, no-cache",
    },
  });
}

export async function middleware(request: NextRequest) {
  const watchResponse = await watchStatusResponse(request);
  if (watchResponse) return watchResponse;

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
  const response = NextResponse.redirect(request.nextUrl, 303);

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
