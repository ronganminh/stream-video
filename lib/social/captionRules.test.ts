import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BANNED_WORDS,
  CAPTION_BUDGET,
  bannedTerms,
  checkCaption,
  defaultCaption,
  fitCaption,
  GENERIC_CAPTION,
} from "./captionRules";
import { xWeight } from "./xText";

describe("banned words", () => {
  it("are the same list as the Colab notebook's", () => {
    const python = readFileSync(path.resolve(__dirname, "../../scripts/publish-client/caption_ai.py"), "utf8");
    const block = /BANNED_WORDS = \(([\s\S]*?)\n\)/.exec(python)?.[1] ?? "";
    const words = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(words.length).toBeGreaterThan(50);
    expect([...BANNED_WORDS].sort()).toEqual([...words].sort());
  });

  it("finds explicit words through case, accents, leetspeak and separators", () => {
    expect(bannedTerms("He is NUDE")).toContain("nude");
    expect(bannedTerms("F.U.C.K yes")).toContain("fuck");
    expect(bannedTerms("c0ck")).toContain("cock");
    expect(bannedTerms("Cocks out")).toContain("cocks");
    expect(bannedTerms("trai đẹp thủ dâm")).toContain("thủ dâm");
    expect(bannedTerms("the boys are back")).toContain("boy");
  });

  it("leaves innocent words alone", () => {
    for (const text of ["Late night in Sussex with a cocktail", "Sexy vibes only 🔥", "Boyfriend goals", "Analysis"]) {
      expect(bannedTerms(text)).toEqual([]);
    }
  });

  it("takes extra words", () => {
    expect(bannedTerms("Shower thoughts", ["shower"])).toEqual(["shower"]);
  });
});

describe("caption checks", () => {
  it("trims to the budget at a word, as X counts", () => {
    const long = "Some mornings are better than others ".repeat(12);
    const fitted = fitCaption(long);
    expect(xWeight(fitted)).toBeLessThanOrEqual(CAPTION_BUDGET);
    expect(fitted.endsWith("…")).toBe(true);
    expect(long.startsWith(fitted.slice(0, -1))).toBe(true);
    expect(CAPTION_BUDGET).toBe(255);
  });

  it("refuses banned words, links and empty captions", () => {
    expect(checkCaption("Worth the wait 🔥").problems).toEqual([]);
    expect(checkCaption("Hot nude guys").problems[0]).toContain("nude");
    expect(checkCaption("See https://gayvideo.fun/watch/x").problems[0]).toContain("link");
    expect(checkCaption("  ").problems).toEqual(["caption trống"]);
  });

  it("fills the template with the title without accents", () => {
    expect(defaultCaption("New video: {title} 🔥", "Trần Đức – Gym")).toBe("New video: Tran Duc – Gym 🔥");
    expect(defaultCaption("", "Gym")).toBe("New video: Gym 🔥");
    expect(defaultCaption("New video: {title}", "Nude beach")).toBe(GENERIC_CAPTION);
    expect(defaultCaption("New video: {name}", "Gym")).toBe(GENERIC_CAPTION);
  });
});
