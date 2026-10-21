import { describe, expect, it } from "vitest";

import robots from "./robots";

describe("robots.txt", () => {
  it("keeps private and duplicate surfaces out and points at the sitemap index", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rules.userAgent).toBe("*");
    expect(rules.allow).toBe("/");
    expect(rules.disallow).toEqual(expect.arrayContaining(["/admin", "/api", "/search"]));
    // Public pages, media and sitemaps must stay crawlable.
    for (const path of ["/watch", "/tag", "/category", "/media", "/sitemaps"]) {
      expect([rules.disallow].flat()).not.toContain(path);
    }
    expect(result.sitemap).toBe("https://gayvideo.fun/sitemap.xml");
  });
});
