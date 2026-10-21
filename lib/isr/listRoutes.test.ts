import { describe, expect, it } from "vitest";

import {
  internalListRedirect,
  listPageNumber,
  listRewrites,
  type ListRewrite,
} from "./listRoutes";

// Mirrors how Next applies beforeFiles rewrites: first match wins, `has` with
// no value needs a non-empty value, `has` with a value is a full-match regex
// whose named groups feed the destination, `missing` needs the key absent or
// empty. The original query is kept on the rewritten request.
function applyRewrites(url: string, rules: ListRewrite[] = listRewrites()) {
  const parsed = new URL(url, "https://example.test");
  const query = parsed.searchParams;

  for (const rule of rules) {
    const source = new RegExp(`^${rule.source.replace(":slug", "(?<slug>[^/]+)")}$`);
    const match = source.exec(parsed.pathname);
    if (!match) continue;

    const params: Record<string, string> = { ...match.groups };
    const hasOk = (rule.has ?? []).every((condition) => {
      const value = query.get(condition.key);
      if (!condition.value) return Boolean(value);
      const groups = value ? new RegExp(`^${condition.value}$`).exec(value) : null;
      if (groups) Object.assign(params, groups.groups);
      return Boolean(groups);
    });
    const missingOk = (rule.missing ?? []).every((condition) => !query.get(condition.key));
    if (!hasOk || !missingOk) continue;

    return rule.destination.replace(/:(\w+)/g, (_, name: string) => params[name]);
  }

  return parsed.pathname;
}

describe("listPageNumber", () => {
  it.each([
    ["2", 2],
    ["37", 37],
    ["999999", 999999],
    ["1", null],
    ["0", null],
    ["-2", null],
    ["02", null],
    ["2.5", null],
    ["abc", null],
    ["1234567", null],
    ["", null],
    [null, null],
  ])("%s -> %s", (input, expected) => {
    expect(listPageNumber(input)).toBe(expected);
  });
});

describe("list rewrites", () => {
  it.each([
    ["/latest", "/latest"],
    ["/latest?page=1", "/latest"],
    ["/latest?page=abc", "/latest"],
    ["/hot?utm_source=x", "/hot"],
    ["/latest?sort=&tag=", "/latest"],
  ])("serves %s from the cached base page", (url, destination) => {
    expect(applyRewrites(url)).toBe(destination);
  });

  it.each([
    ["/latest?page=2", "/latest/p/2"],
    ["/hot?page=3", "/hot/p/3"],
    ["/most-viewed?page=4&utm_source=x", "/most-viewed/p/4"],
    ["/category/muscle?page=2", "/category/muscle/p/2"],
    ["/tag/gym?page=12", "/tag/gym/p/12"],
    // An empty filter is no filter: still the cached page 2.
    ["/latest?sort=&page=2", "/latest/p/2"],
    // /hot has no sort filter, so sort is ignored like any unknown parameter.
    ["/hot?sort=views&page=2", "/hot/p/2"],
  ])("caches %s as its own page entry", (url, destination) => {
    expect(applyRewrites(url)).toBe(destination);
  });

  it.each([
    ["/latest?sort=views&page=2", "/latest/filter"],
    ["/latest?tag=gym", "/latest/filter"],
    ["/latest?category=muscle", "/latest/filter"],
    ["/hot?window=week", "/hot/filter"],
    ["/most-viewed?sort=newest", "/most-viewed/filter"],
    ["/category/muscle?duration=5-15", "/category/muscle/filter"],
    ["/tag/gym?date=today&page=3", "/tag/gym/filter"],
  ])("renders filtered %s per request", (url, destination) => {
    expect(applyRewrites(url)).toBe(destination);
  });

  it("leaves other routes alone", () => {
    for (const url of [
      "/",
      "/search?q=gym&page=2",
      "/watch/some-video?page=2",
      "/categories?page=2",
      "/admin/videos?page=2",
      "/api/list?page=2",
      "/category/muscle/extra?page=2",
    ]) {
      expect(applyRewrites(url)).toBe(new URL(url, "https://example.test").pathname);
    }
  });

  it("checks filters before the page rule for every list", () => {
    const rules = listRewrites();
    for (const source of new Set(rules.map((rule) => rule.source))) {
      const forSource = rules.filter((rule) => rule.source === source);
      expect(forSource.at(-1)?.destination, source).toMatch(/\/p\/:page$/);
      expect(
        forSource.slice(0, -1).every((rule) => rule.destination.endsWith("/filter")),
        source,
      ).toBe(true);
    }
  });
});

describe("internalListRedirect", () => {
  function redirect(url: string) {
    const parsed = new URL(url, "https://example.test");
    return internalListRedirect(parsed.pathname, parsed.searchParams);
  }

  it.each([
    ["/latest/p/3", "/latest", "page=3"],
    ["/latest/p/1", "/latest", ""],
    ["/latest/p/oops", "/latest", ""],
    ["/tag/gym/p/2", "/tag/gym", "page=2"],
    ["/latest/filter?sort=views", "/latest", "sort=views"],
    ["/category/muscle/filter?date=week", "/category/muscle", "date=week"],
  ])("sends %s to its public URL", (url, pathname, search) => {
    expect(redirect(url)).toEqual({ pathname, search });
  });

  it("ignores non-list paths that merely look similar", () => {
    for (const url of ["/watch/p/2", "/search/filter", "/category/a/b/p/2", "/latest"]) {
      expect(redirect(url)).toBeNull();
    }
  });
});
