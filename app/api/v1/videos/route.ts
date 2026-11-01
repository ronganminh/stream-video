import { NextResponse } from "next/server";

import { publishInputSchema, publishVideo } from "@/lib/api/publishVideo";
import { apiError, withApiToken } from "@/lib/api/respond";
import { revalidatePublicPages } from "@/lib/revalidatePublic";

// Publish API for scripts (Colab, laptop): see docs/API.md.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A data: URL thumbnail of ~8 MB plus the rest of the body.
const MAX_BODY_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  return withApiToken(request, async (actor) => {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAX_BODY_BYTES) {
      return apiError(413, "too_large", "The request body is larger than 12 MB.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "invalid_json", "The body must be JSON.");
    }

    const parsed = publishInputSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(422, "invalid_input", "Some fields are missing or invalid.", {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await publishVideo(parsed.data, actor);
    if (parsed.data.publish) revalidatePublicPages();
    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
      headers: { "cache-control": "no-store" },
    });
  });
}
