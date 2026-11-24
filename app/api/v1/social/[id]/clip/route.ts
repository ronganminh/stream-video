import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withApiToken } from "@/lib/api/respond";
import { attachClip, ClipJobError } from "@/lib/social/clipJobs";

// For the GitHub Actions clip workflow: the clip (uploaded first to
// /api/v1/clips) for a "preparing" X post. Body: {"clipId": "...", "source": "earnvids"}.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ clipId: z.string().min(1).max(64), source: z.string().max(40).default("") });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiToken(request, async () => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(400, "invalid_body", 'Send {"clipId": "...", "source": "..."}.');
    try {
      const result = await attachClip({ postId: (await params).id, ...parsed.data });
      return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof ClipJobError) return apiError(error.status, error.code, error.message);
      throw error;
    }
  });
}
