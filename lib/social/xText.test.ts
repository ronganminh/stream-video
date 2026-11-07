import { describe, expect, it } from "vitest";

import { composeXText, xWeight } from "./xText";

const URL = "https://gayvideo.fun/watch/bevis-tran-duc-vuong-my-love-story";

describe("xWeight", () => {
  it("weighs like X: up to U+10FF and common punctuation 1, the rest 2", () => {
    // "ầ" and "ứ" (Latin Extended Additional) weigh 2; "Đ", "–", quotes 1.
    expect(xWeight("Trần Đức – “Hi”")).toBe(17);
    expect(xWeight("…")).toBe(2);
    expect(xWeight("日本")).toBe(4);
    expect(xWeight("🔥")).toBe(2);
  });
});

describe("composeXText", () => {
  it("puts the link after the caption", () => {
    expect(composeXText("New video: Bevis", URL)).toBe(`New video: Bevis\n\n${URL}`);
  });

  it("trims a long caption so caption + link fit X's 280", () => {
    const text = composeXText("a".repeat(400), URL);
    const [caption] = text.split("\n\n");
    expect(caption.endsWith("…")).toBe(true);
    // The URL counts as 23 whatever its length.
    expect(xWeight(caption) + 2 + 23).toBeLessThanOrEqual(280);
    expect(xWeight(caption) + 2 + 23).toBeGreaterThan(275);
    expect(text.endsWith(URL)).toBe(true);
  });

  it("counts emoji double when trimming", () => {
    const [caption] = composeXText("🔥".repeat(200), URL).split("\n\n");
    expect(xWeight(caption) + 25).toBeLessThanOrEqual(280);
  });

  it("is just the link without a caption", () => {
    expect(composeXText("   ", URL)).toBe(URL);
  });
});
