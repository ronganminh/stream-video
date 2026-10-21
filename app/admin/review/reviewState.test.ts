import { describe, expect, it } from "vitest";
import { z } from "zod";

import { mergeQueueOrder, reviewErrorMessage } from "./reviewState";

describe("mergeQueueOrder", () => {
  it("keeps a handled video's slot after the server drops it", () => {
    // b was approved; the refresh no longer lists it and pulls e in.
    expect(mergeQueueOrder(["a", "b", "c", "d"], ["a", "c", "d", "e"], ["b"])).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("appends videos new to the page instead of inserting them above", () => {
    // A freshly synced draft sorts first on the server, but inserting it at
    // the top would push everything the admin is reading down.
    expect(mergeQueueOrder(["a", "b"], ["new", "a", "b"], [])).toEqual(["a", "b", "new"]);
  });

  it("drops videos that left the page and are not being shown as handled", () => {
    expect(mergeQueueOrder(["a", "b", "c"], ["a", "c"], [])).toEqual(["a", "c"]);
  });

  it("puts an undone video back in its original slot", () => {
    // b was approved then undone: it is back in the server list and no
    // longer kept as a handled row.
    expect(mergeQueueOrder(["a", "b", "c", "e"], ["a", "b", "c", "e"], [])).toEqual([
      "a",
      "b",
      "c",
      "e",
    ]);
  });

  it("does not duplicate ids", () => {
    expect(mergeQueueOrder(["a"], ["a", "a", "b"], ["a"])).toEqual(["a", "b"]);
  });
});

describe("reviewErrorMessage", () => {
  it("turns validation errors into a readable hint", () => {
    const result = z.object({ slug: z.string().regex(/^[a-z]+$/) }).safeParse({ slug: "Bad Slug" });
    expect(result.success).toBe(false);
    expect(reviewErrorMessage(result.error)).toMatch(/slug/i);
  });

  it("passes through domain errors", () => {
    expect(reviewErrorMessage(new Error("Slug already exists."))).toBe("Slug already exists.");
  });

  it("has a fallback for anything else", () => {
    expect(reviewErrorMessage(undefined)).toBe("Something went wrong. Please try again.");
  });
});
