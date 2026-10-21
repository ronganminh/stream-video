import { describe, expect, it } from "vitest";

import { watchBreadcrumbs } from "./breadcrumbs";

describe("watchBreadcrumbs", () => {
  it("includes the category when the video has one", () => {
    expect(
      watchBreadcrumbs("clip", { title: "Clip", category: { slug: "muscle", name: "Muscle" } }),
    ).toEqual([
      { name: "Home", path: "/" },
      { name: "Muscle", path: "/category/muscle" },
      { name: "Clip", path: "/watch/clip" },
    ]);
  });

  it.each([
    ["the uncategorized placeholder", { slug: "uncategorized", name: "Uncategorized" }],
    ["no category", null],
  ])("skips the category step for %s", (_label, category) => {
    expect(watchBreadcrumbs("clip", { title: "Clip", category })).toEqual([
      { name: "Home", path: "/" },
      { name: "Clip", path: "/watch/clip" },
    ]);
  });
});
