"use server";

import { search } from "@/lib/data";

export async function loadSearchPage(
  q: string,
  query: {
    duration?: string;
    date?: string;
    category?: string;
    sort?: string;
    page: number;
  },
) {
  return search(q, query);
}
