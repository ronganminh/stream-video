import { describe, expect, it } from "vitest";

import { queryWhere } from "./lists";

describe("list query filters", () => {
  it("adds the requested tag without changing existing filters", () => {
    expect(
      queryWhere({
        category: "fitness",
        tag: "beach",
        duration: "15-30",
      }),
    ).toEqual({
      AND: [
        {
          category: {
            is: {
              slug: "fitness",
            },
          },
        },
        {
          videoTags: {
            some: {
              tag: {
                is: {
                  slug: "beach",
                },
              },
            },
          },
        },
        {
          durationSeconds: {
            gte: 900,
            lt: 1800,
          },
        },
      ],
    });
  });

  it("keeps the previous no-filter behavior", () => {
    expect(queryWhere({})).toEqual({});
  });
});
