import { revalidatePath } from "next/cache";

// Public pages are ISR-cached (lists, tags, categories, watch pages, and the
// layout's settings), and one admin edit can show up on many of them, so purge
// the whole public cache. Admin edits are rare, so the rebuild cost is small.
export function revalidatePublicPages(): void {
  revalidatePath("/", "layout");
}
