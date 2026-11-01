import { NextResponse } from "next/server";

import { withApiToken } from "@/lib/api/respond";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// What a client may send: enabled hosts and existing category slugs. Also a
// cheap way to check a token works.
export async function GET(request: Request) {
  return withApiToken(request, async (actor) => {
    const [hosts, categories] = await Promise.all([
      db.host.findMany({
        where: { enabled: true },
        select: { id: true, label: true, isPrimary: true },
        orderBy: { sortOrder: "asc" },
      }),
      db.category.findMany({
        select: { slug: true, name: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ]);
    return NextResponse.json(
      { token: actor.tokenName, hosts, categories },
      { headers: { "cache-control": "no-store" } },
    );
  });
}
