import { afterEach, describe, expect, it } from "vitest";

import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "./session";

const originalSecret = process.env.ADMIN_SESSION_SECRET;

afterEach(() => {
  process.env.ADMIN_SESSION_SECRET = originalSecret;
});

describe("admin sessions", () => {
  it("signs and verifies an unexpired session", () => {
    process.env.ADMIN_SESSION_SECRET = "test-secret-with-enough-entropy";
    const now = Date.UTC(2026, 9, 4, 0, 0, 0);
    const token = createAdminSessionToken("admin-1", now);

    expect(verifyAdminSessionToken(token, now + 1_000)).toMatchObject({
      adminId: "admin-1",
    });
  });

  it("rejects tampered sessions", () => {
    process.env.ADMIN_SESSION_SECRET = "test-secret-with-enough-entropy";
    const token = createAdminSessionToken("admin-1", 1_000);
    expect(verifyAdminSessionToken(`${token}x`, 1_001)).toBeNull();
  });

  it("rejects expired sessions", () => {
    process.env.ADMIN_SESSION_SECRET = "test-secret-with-enough-entropy";
    const token = createAdminSessionToken("admin-1", 1_000);
    expect(
      verifyAdminSessionToken(token, 1_000 + 13 * 60 * 60 * 1_000),
    ).toBeNull();
  });
});
