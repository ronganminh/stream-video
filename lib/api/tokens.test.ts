import { describe, expect, it } from "vitest";

import { bearerToken, generateApiToken, hashApiToken } from "./tokens";

describe("API tokens", () => {
  it("generates distinct gv_ tokens that parse back from a Bearer header", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^gv_[A-Za-z0-9_-]{43}$/);
    expect(bearerToken(`Bearer ${a}`)).toBe(a);
  });

  it("hashes with SHA-256 hex", () => {
    expect(hashApiToken("gv_x")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiToken("gv_x")).toBe(hashApiToken("gv_x"));
  });

  it.each([null, "", "gv_abc", "Basic abc", "Bearer gv_short", "Bearer  sk_" + "a".repeat(43)])(
    "rejects malformed header %j",
    (header) => {
      expect(bearerToken(header)).toBeNull();
    },
  );
});
