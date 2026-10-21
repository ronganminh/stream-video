import { notFound } from "next/navigation";

export function totalPagesFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * A list page past the last one is a 404, not an empty "Page 9999" that asks
 * to be indexed. Page 1 always exists (an empty list shows its empty state).
 * Callers must render outside a loading.tsx boundary for the 404 status to
 * reach the response.
 */
export function notFoundPastLastPage(list: { page: number; total: number; pageSize: number }) {
  if (list.page > totalPagesFor(list.total, list.pageSize)) notFound();
}
