import { describe, expect, it } from "vitest";

import { lostDSlug } from "./lostDSlugs";

describe("lostDSlug", () => {
  it("proposes the đ-preserving slug for a legacy one", () => {
    expect(lostDSlug("Bevis Trần Đức Vương – My love story", "bevis-tran-uc-vuong-my-love-story")).toBe(
      "bevis-tran-duc-vuong-my-love-story",
    );
  });

  it("keeps the uniqueness suffix", () => {
    expect(lostDSlug("Trần Đức", "tran-uc-3")).toBe("tran-duc-3");
  });

  it.each([
    ["no đ in the title", "Phở Hà Nội", "pho-ha-noi"],
    ["already right", "Trần Đức", "tran-duc"],
    ["chosen by hand", "Trần Đức", "my-custom-slug"],
  ])("ignores slugs with %s", (_label, name, slug) => {
    expect(lostDSlug(name, slug)).toBeNull();
  });
});
