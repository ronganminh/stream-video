"use server";

import { getCategoryPageData } from "./data";

export async function loadCategoryPage(
  slug: string,
  query: {
    sort?: string;
    duration?: string;
    date?: string;
    page: number;
  },
) {
  const result = await getCategoryPageData(slug, query);
  if (!result) return null;
  return result.videos;
}
