import { describe, expect, it } from "vitest";

import { firstFreeSlug } from "./fixLostDSlugs";

describe("firstFreeSlug", () => {
  const takenFrom = (taken: string[]) => async (slug: string) => taken.includes(slug);

  it("keeps the proposed slug when it is free", async () => {
    expect(await firstFreeSlug("tran-duc", takenFrom([]))).toEqual({
      slug: "tran-duc",
      suffixed: false,
    });
  });

  it("adds the first free -N suffix when taken", async () => {
    expect(await firstFreeSlug("tran-duc", takenFrom(["tran-duc", "tran-duc-2"]))).toEqual({
      slug: "tran-duc-3",
      suffixed: true,
    });
  });
});
