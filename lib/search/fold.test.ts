import { describe, expect, it } from "vitest";

import { escapeRegex, FOLD_TRANSLATE, foldText } from "./fold";

describe("foldText", () => {
  it.each([
    ["Bevis Trần Đức Vương", "bevis tran duc vuong"],
    ["TRẦN", "tran"],
    ["đường", "duong"],
    ["Phở Hà Nội", "pho ha noi"],
    ["Ladyboy Transgender", "ladyboy transgender"],
    // Decomposed input (e + combining circumflex + combining dot below).
    ["Trện", "tren"],
  ])("%s -> %s", (input, expected) => {
    expect(foldText(input)).toBe(expected);
  });
});

describe("FOLD_TRANSLATE", () => {
  it("pairs each accented letter with its folded ASCII letter", () => {
    const from = [...FOLD_TRANSLATE.from];
    const to = [...FOLD_TRANSLATE.to];
    expect(from).toHaveLength(to.length);
    from.forEach((char, index) => expect(foldText(char)).toBe(to[index]));
  });

  it("covers every Vietnamese letter", () => {
    const vietnamese =
      "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ";
    for (const char of vietnamese + vietnamese.toUpperCase()) {
      expect(FOLD_TRANSLATE.from).toContain(char);
    }
  });
});

describe("escapeRegex", () => {
  it("escapes regex syntax", () => {
    expect(escapeRegex("a.b*(c)")).toBe("a\\.b\\*\\(c\\)");
  });
});
