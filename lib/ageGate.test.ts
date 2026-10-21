import { describe, expect, it } from "vitest";

import {
  AGE_GATE_CONFIRMED_ATTRIBUTE,
  ageGateBootScript,
  hasAgeGateCookie,
} from "./ageGate";

describe("hasAgeGateCookie", () => {
  it.each([
    ["gv_age_ack=1", true],
    ["a=b; gv_age_ack=1", true],
    ["gv_age_ack=1; a=b", true],
    ["a=b;gv_age_ack=1", true],
    ["gv_age_ack=0", false],
    ["gv_age_ack=10", false],
    ["xgv_age_ack=1", false],
    ["", false],
  ])("%j -> %s", (cookie, expected) => {
    expect(hasAgeGateCookie(cookie)).toBe(expected);
  });
});

describe("ageGateBootScript", () => {
  function run(cookie: string, hash = "") {
    const attributes = new Map<string, string>();
    const document = {
      cookie,
      documentElement: {
        setAttribute: (name: string, value: string) => attributes.set(name, value),
      },
    };
    new Function("document", "location", ageGateBootScript)(document, { hash });
    return attributes.has(AGE_GATE_CONFIRMED_ATTRIBUTE);
  }

  it("marks the page as confirmed when the cookie is present", () => {
    expect(run("theme=dark; gv_age_ack=1")).toBe(true);
  });

  it("marks the page as confirmed after the no-JS redirect fragment", () => {
    expect(run("", "#gv-age-ok")).toBe(true);
  });

  it("leaves the gate up for first-time visitors", () => {
    expect(run("theme=dark")).toBe(false);
    expect(run("gv_age_ack=0", "#other")).toBe(false);
  });

  it("never throws, even when cookies are inaccessible", () => {
    const document = {
      get cookie(): string {
        throw new Error("SecurityError");
      },
      documentElement: { setAttribute: () => undefined },
    };
    expect(() =>
      new Function("document", "location", ageGateBootScript)(document, { hash: "" }),
    ).not.toThrow();
  });
});
