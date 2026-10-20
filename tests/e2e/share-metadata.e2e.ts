import { expect, test } from "@playwright/test";

import { AVAILABLE_SLUG } from "./helpers";

// Link-preview crawlers never pass the age gate, so share metadata must be in
// the server-rendered <head> of the first response, with no age cookie set.
for (const userAgent of [
  "Twitterbot/1.0",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
]) {
  test(`share metadata reaches ${userAgent.split("/")[0]} without the age cookie`, async ({
    request,
  }) => {
    const response = await request.get(`/watch/${AVAILABLE_SLUG}`, {
      headers: { "user-agent": userAgent },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);

    const html = await response.text();
    const head = html.slice(0, html.indexOf("</head>"));
    const meta = (attribute: "property" | "name", key: string) =>
      head.match(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`))?.[1];

    expect(meta("property", "og:title")).toBeTruthy();
    expect(meta("name", "description")).toBeTruthy();
    expect(meta("property", "og:url")).toMatch(
      new RegExp(`^https?://[^/]+/watch/${AVAILABLE_SLUG}$`),
    );
    expect(meta("property", "og:type")).toBe("video.other");
    expect(meta("property", "og:site_name")).toBe("GayVideo.fun");
    expect(meta("property", "og:image")).toMatch(/^https?:\/\//);
    expect(meta("property", "og:image:width")).toBeTruthy();
    expect(meta("property", "og:image:height")).toBeTruthy();
    expect(meta("name", "twitter:card")).toMatch(/^summary(_large_image)?$/);
    expect(meta("name", "twitter:title")).toBeTruthy();
    expect(meta("name", "twitter:image")).toMatch(/^https?:\/\//);
    expect(head).toMatch(
      new RegExp(`<link rel="canonical" href="https?://[^/]+/watch/${AVAILABLE_SLUG}"`),
    );
  });
}

test("home page carries default share metadata", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const head = html.slice(0, html.indexOf("</head>"));

  expect(head).toContain('<meta property="og:site_name" content="GayVideo.fun"');
  expect(head).toMatch(/<meta name="description" content="[^"]+"/);
  expect(head).toMatch(/<link rel="canonical" href="https?:\/\/[^/]+\/"/);
});
