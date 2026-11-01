import { NextResponse } from "next/server";

import { ApiError } from "./publishVideo";
import { authenticateApiToken, type ApiActor } from "./tokens";

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error: { code, message, ...(details ?? {}) } },
    {
      status,
      headers: {
        "cache-control": "no-store",
        ...(status === 401 ? { "www-authenticate": 'Bearer realm="gayvideo-api"' } : {}),
      },
    },
  );
}

/** Runs `handler` for a valid token; maps ApiError and the unexpected. */
export async function withApiToken(
  request: Request,
  handler: (actor: ApiActor) => Promise<Response>,
): Promise<Response> {
  const actor = await authenticateApiToken(request.headers.get("authorization"));
  if (!actor) {
    return apiError(401, "unauthorized", "Send a valid token: Authorization: Bearer gv_…");
  }
  try {
    return await handler(actor);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.status, error.code, error.message, error.details);
    }
    console.error("publish API error", error);
    return apiError(500, "internal_error", "Unexpected server error; nothing may have been saved.");
  }
}
