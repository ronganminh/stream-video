import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { withPublicVisibility } from "@/lib/data/prisma/visibility";

const LIKE_COOKIE_PREFIX = "gv-like-";
const LIKE_COOKIE_SECONDS = 365 * 24 * 60 * 60;

function cookieName(videoId: string): string {
  return `${LIKE_COOKIE_PREFIX}${encodeURIComponent(videoId)}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const name = cookieName(id);

  const video = await prisma.video.findFirst({
    where: withPublicVisibility({ id }),
    select: { id: true, likes: true },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (request.cookies.has(name)) {
    return NextResponse.json({ counted: false, likes: video.likes });
  }

  const updated = await prisma.video.update({
    where: { id },
    data: { likes: { increment: 1 } },
    select: { likes: true },
  });

  const response = NextResponse.json({ counted: true, likes: updated.likes });
  response.cookies.set(name, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LIKE_COOKIE_SECONDS,
  });

  return response;
}
