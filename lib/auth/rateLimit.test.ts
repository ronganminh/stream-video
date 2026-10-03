import { describe, expect, it } from "vitest";

import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "./rateLimit";

describe("login rate limit", () => {
  it("blocks after the configured number of failures", () => {
    const key = "test-user-1";
    clearLoginFailures(key);

    for (let index = 0; index < 5; index += 1) {
      expect(checkLoginRateLimit(key, { now: index })).toMatchObject({
        allowed: true,
      });
      recordLoginFailure(key, index);
    }

    expect(checkLoginRateLimit(key, { now: 5 })).toMatchObject({
      allowed: false,
    });

    clearLoginFailures(key);
  });
});
