import { NextResponse } from "next/server";

import { apiError, withApiToken } from "@/lib/api/respond";
import { ClipError, storeClip } from "@/lib/social/clips";
import { socialConfig } from "@/lib/social/config";

// Upload the short clip for X before POST /api/v1/videos (see docs/API.md).
// The body is the MP4 itself (Content-Type: video/mp4), streamed to disk.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return withApiToken(request, async () => {
    const config = socialConfig();
    const type = request.headers.get("content-type") ?? "";
    if (!/^video\/mp4\b/i.test(type)) {
      return apiError(415, "unsupported_type", "Send the clip as the body with Content-Type: video/mp4.");
    }
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > config.clipMaxBytes) {
      return apiError(413, "too_large", `The clip is larger than ${Math.round(config.clipMaxBytes / 1048576)} MB.`);
    }
    try {
      const clip = await storeClip(request.body, {
        maxBytes: config.clipMaxBytes,
        // "Keep whole video" posts may be up to X_MAX_VIDEO_SECONDS long.
        maxSeconds: config.clipSeconds === 0 ? 0 : Math.max(config.clipSeconds, config.maxVideoSeconds),
      });
      return NextResponse.json(
        { clipId: clip.clipId, bytes: clip.bytes, seconds: Math.round(clip.seconds * 10) / 10 },
        { status: 201, headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof ClipError) return apiError(error.status, error.code, error.message);
      throw error;
    }
  });
}
