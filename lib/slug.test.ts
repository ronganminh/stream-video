import { describe, expect, it } from "vitest";

import { legacySlugify, SLUG_PATTERN, slugFromInput, slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["Trần Đức", "tran-duc"],
    ["Bevis Trần Đức Vương", "bevis-tran-duc-vuong"],
    ["đầm", "dam"],
    ["ĐẦM LẦY", "dam-lay"],
    ["Đà Nẵng – Phố đêm!!", "da-nang-pho-dem"],
    ["  Hello, World?  ", "hello-world"],
    ["C++ & Rust: 100% (v2.0)", "c-rust-100-v2-0"],
    ["Mr. Smith", "mr-smith"],
    ["---", ""],
    ["日本語", ""],
    // Decomposed input (e + combining circumflex + dot below).
    ["Trện", "tren"],
  ])("%j -> %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
    if (expected) expect(expected).toMatch(SLUG_PATTERN);
  });

  it("caps the length without leaving a trailing dash", () => {
    expect(slugify("abc def ghi", 4)).toBe("abc");
    expect(slugify("a".repeat(300))).toHaveLength(240);
  });

  it("differs from the legacy rule only where đ was dropped", () => {
    expect(legacySlugify("Trần Đức")).toBe("tran-uc");
    expect(slugify("Trần Đức")).toBe("tran-duc");
    expect(legacySlugify("Phở Hà Nội")).toBe(slugify("Phở Hà Nội"));
  });
});

describe("slugFromInput", () => {
  it("slugifies what the admin typed", () => {
    expect(slugFromInput("Trần Đức", "ignored")).toBe("tran-duc");
    expect(slugFromInput("already-a-slug", "ignored")).toBe("already-a-slug");
  });

  it("derives from the fallback when the field is empty", () => {
    expect(slugFromInput("  ", "Đầm Sen")).toBe("dam-sen");
    expect(slugFromInput(null, "Đầm Sen")).toBe("dam-sen");
  });
});
