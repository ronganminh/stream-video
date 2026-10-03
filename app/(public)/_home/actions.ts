"use server";

import { getLatest } from "@/lib/data";

export async function loadLatestHomePage(page: number) {
  const normalizedPage =
    Number.isInteger(page) && page > 1 ? page : 2;
  const result = await getLatest({ page: normalizedPage });

  return {
    items: result.items,
    nextHref: result.nextHref ?? null,
    page: result.page,
  };
}
