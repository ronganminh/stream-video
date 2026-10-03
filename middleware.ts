import { NextResponse, type NextRequest } from "next/server";

import {
  AGE_GATE_COOKIE_NAME,
  getAgeGateCookieLifetimeDays,
} from "@/lib/settings/ageGate";

const AGE_GATE_ACTION_FIELD = "_gv_age_gate";
const AGE_GATE_ACTION_VALUE = "acknowledge";
const SECONDS_PER_DAY = 24 * 60 * 60;

export async function middleware(request: NextRequest) {
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
