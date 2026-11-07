import { NextResponse } from "next/server";

import { getVideoForApi } from "@/lib/api/publishVideo";
import { apiError, withApiToken } from "@/lib/api/respond";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiToken(request, async () => {
    const video = await getVideoForApi((await params).id);
    if (!video) return apiError(404, "not_found", "No video with that id.");
    return NextResponse.json({ video }, { headers: { "cache-control": "no-store" } });
  });
}
