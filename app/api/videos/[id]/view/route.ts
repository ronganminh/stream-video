import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { withPublicVisibility } from "@/lib/data/prisma/visibility";

const VIEW_COOKIE_PREFIX = "gv-view-";
const VIEW_WINDOW_SECONDS = 6 * 60 * 60;

function cookieName(videoId: string): string {
  return `${VIEW_COOKIE_PREFIX}${encodeURIComponent(videoId)}`;
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const name = cookieName(id);

  const video = await prisma.video.findFirst({
    where: withPublicVisibility({ id }),
    select: { id: true, views: true },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (request.cookies.has(name)) {
    return NextResponse.json({ counted: false, views: video.views });
  }

  const now = new Date();
  const day = utcDay(now);
  const updated = await prisma.$transaction(async (tx) => {
    const nextVideo = await tx.video.update({
      where: { id },
      data: { views: { increment: 1 } },
      select: { views: true },
    });

    await tx.videoDailyStat.upsert({
      where: {
        videoId_date: {
          videoId: id,
          date: day,
        },
      },
      update: {
        views: { increment: 1 },
      },
      create: {
        videoId: id,
        date: day,
        views: 1,
      },
    });

    return nextVideo;
  });

  const response = NextResponse.json({ counted: true, views: updated.views });
  response.cookies.set(name, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VIEW_WINDOW_SECONDS,
  });

  return response;
}
