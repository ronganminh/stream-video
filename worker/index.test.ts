import { describe, expect, it } from "vitest";

import { isDue } from "./index";

describe("worker scheduling", () => {
  const now = new Date("2026-10-04T00:00:00.000Z");

  it("runs jobs that have never completed", () => {
    expect(isDue(null, 15 * 60_000, now)).toBe(true);
  });

  it("uses the supplied setting interval instead of a fixed source value", () => {
    expect(
      isDue(new Date("2026-10-03T23:50:00.000Z"), 15 * 60_000, now),
    ).toBe(false);
    expect(
      isDue(new Date("2026-10-03T23:40:00.000Z"), 15 * 60_000, now),
    ).toBe(true);
  });
});
