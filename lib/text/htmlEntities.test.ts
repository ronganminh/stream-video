import { describe, expect, it } from "vitest";

import { cleanTitle, decodeHtmlEntities, hasHtmlEntity } from "./htmlEntities";

describe("decodeHtmlEntities", () => {
  it.each([
    ["Nghĩa x Tiến &#40;anh điện lạnh&#41;", "Nghĩa x Tiến (anh điện lạnh)"],
    ["P1 &#x28;caubeluoidai&#x29;", "P1 (caubeluoidai)"],
    ["Anh shipper &amp; vị khách", "Anh shipper & vị khách"],
    ["&quot;thốn&quot; &lt;3", '"thốn" <3'],
    ["Double &amp;#40;escaped&amp;#41;", "Double (escaped)"],
    ["Ruby &ndash; Mượn tiền &hellip;", "Ruby – Mượn tiền …"],
    ["Tr&#7847;n &#272;&#7913;c", "Trần Đức"],
  ])("%s", (input, expected) => {
    expect(decodeHtmlEntities(input)).toBe(expected);
  });

  it("leaves text that only looks like an entity alone", () => {
    expect(decodeHtmlEntities("AT&T & co; &unknown; &#0; &#xD800;")).toBe(
      "AT&T & co; &unknown; &#0; &#xD800;",
    );
  });
});

describe("cleanTitle", () => {
  it("decodes and collapses whitespace, including nbsp", () => {
    expect(cleanTitle("  Hoa&nbsp;nắng   boy &#40;P1&#41; ")).toBe("Hoa nắng boy (P1)");
  });
});

describe("hasHtmlEntity", () => {
  it("spots entities", () => {
    expect(hasHtmlEntity("P1 &#40;x&#41;")).toBe(true);
    expect(hasHtmlEntity("Tom & Jerry")).toBe(false);
  });
});
