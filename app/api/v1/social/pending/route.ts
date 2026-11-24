import { NextResponse } from "next/server";

import { withApiToken } from "@/lib/api/respond";
import { listPendingClips } from "@/lib/social/clipJobs";

// For the GitHub Actions clip workflow: X posts waiting for a clip.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiToken(request, async () => {
    const posts = await listPendingClips();
    return NextResponse.json({ posts }, { headers: { "cache-control": "no-store" } });
  });
}
