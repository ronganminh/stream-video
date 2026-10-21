// Shared, non-action values for the review queue. Kept out of the
// "use server" actions module, which may only export async functions.

export type ReviewActionResult = { ok: true } | { ok: false; error: string };

export const REVIEW_PAGE_SIZE = 10;

export type ReviewOutcome =
  | "publishing"
  | "published"
  | "rejecting"
  | "rejected"
  | "restoring";

export type ReviewDone = {
  outcome: ReviewOutcome;
  title: string;
  slug: string;
};

/**
 * Display order for the queue across server refreshes. Every approve or
 * reject re-renders the page on the server, which drops the handled video and
 * pulls the next one in from the following page. To keep the list still:
 * - handled videos keep their slot (they show as a one-line "Published · Undo"
 *   row until the admin leaves the page);
 * - videos that are new to this page are appended at the end, below the
 *   viewport, instead of being inserted above what the admin is reading.
 */
export function mergeQueueOrder(
  previous: readonly string[],
  serverIds: readonly string[],
  keepIds: Iterable<string>,
): string[] {
  const server = new Set(serverIds);
  const keep = new Set(keepIds);
  const order = previous.filter((id) => server.has(id) || keep.has(id));
  const known = new Set(order);

  for (const id of serverIds) {
    if (!known.has(id)) {
      order.push(id);
      known.add(id);
    }
  }

  return order;
}

export function reviewErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error) {
    return "Check the title and slug: a slug may only use a-z, 0-9 and dashes.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Please try again.";
}
