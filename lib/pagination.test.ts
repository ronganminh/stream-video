import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { notFoundPastLastPage, totalPagesFor } = await import("./pagination");

describe("totalPagesFor", () => {
  it.each([
    [0, 20, 1],
    [1, 20, 1],
    [20, 20, 1],
    [21, 20, 2],
  ])("%i items, %i per page -> %i pages", (total, size, pages) => {
    expect(totalPagesFor(total, size)).toBe(pages);
  });
});

describe("notFoundPastLastPage", () => {
  it("lets every existing page through, including an empty page 1", () => {
    expect(() => notFoundPastLastPage({ page: 1, total: 0, pageSize: 20 })).not.toThrow();
    expect(() => notFoundPastLastPage({ page: 3, total: 41, pageSize: 20 })).not.toThrow();
  });

  it("404s past the last page", () => {
    expect(() => notFoundPastLastPage({ page: 3, total: 40, pageSize: 20 })).toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(() => notFoundPastLastPage({ page: 9999, total: 63, pageSize: 20 })).toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
