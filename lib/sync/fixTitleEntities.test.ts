import { describe, expect, it } from "vitest";

import { reslugFor } from "./fixTitleEntities";

const escaped = "Hoa nắng boy – Nghĩa x Tiến &#40;anh điện lạnh&#41;";
const clean = "Hoa nắng boy – Nghĩa x Tiến (anh điện lạnh)";

describe("reslugFor", () => {
  it("drops the entity debris from a generated slug", () => {
    expect(reslugFor(escaped, clean, "hoa-nang-boy-nghia-x-tien-40-anh-dien-lanh-41")).toBe(
      "hoa-nang-boy-nghia-x-tien-anh-dien-lanh",
    );
  });

  it("keeps a uniqueness suffix", () => {
    expect(reslugFor(escaped, clean, "hoa-nang-boy-nghia-x-tien-40-anh-dien-lanh-41-2")).toBe(
      "hoa-nang-boy-nghia-x-tien-anh-dien-lanh-2",
    );
  });

  it("leaves hand-chosen slugs alone", () => {
    expect(reslugFor(escaped, clean, "nghia-x-tien")).toBeNull();
  });

  it("handles named and numeric entities in the generated slug", () => {
    expect(reslugFor("Ruby &amp; Co", "Ruby & Co", "ruby-amp-co")).toBe("ruby-co");
    expect(reslugFor("A &quot;B&quot;", 'A "B"', "a-quot-b-quot")).toBe("a-b");
    expect(reslugFor("A &#8211; B", "A – B", "a-8211-b")).toBe("a-b");
  });
});
