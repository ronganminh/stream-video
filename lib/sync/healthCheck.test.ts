import { describe, expect, it } from "vitest";

import { shouldMarkRemoved } from "./healthCheck";

describe("health behavior", () => {
  it("keeps a video available while at least one mirror is OK", () => {
    expect(shouldMarkRemoved(1)).toBe(false);
    expect(shouldMarkRemoved(3)).toBe(false);
  });

  it("marks a video removed when every mirror is missing", () => {
    expect(shouldMarkRemoved(0)).toBe(true);
  });
});
