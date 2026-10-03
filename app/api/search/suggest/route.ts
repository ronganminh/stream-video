import { NextResponse } from "next/server";

import { getSuggestions } from "@/lib/data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const suggestions = await getSuggestions(query);

  return NextResponse.json(suggestions);
}
