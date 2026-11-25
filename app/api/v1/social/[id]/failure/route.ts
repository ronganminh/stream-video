import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withApiToken } from "@/lib/api/respond";
import { ClipJobError, reportClipFailure } from "@/lib/social/clipJobs";

// For the GitHub Actions clip workflow: no clip could be made for a post.
// Body: {"reason": "...", "final": false}. Links in the reason are removed.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  reason: z.string().max(4000),
  final: z.boolean().default(false),
  // Google Drive's per-file download quota: wait hours, not an attempt.
  quota: z.boolean().default(false),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiToken(request, async () => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(400, "invalid_body", 'Send {"reason": "...", "final": false}.');
    try {
      const result = await reportClipFailure({ postId: (await params).id, ...parsed.data });
      return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof ClipJobError) return apiError(error.status, error.code, error.message);
      throw error;
    }
  });
}
