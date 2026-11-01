import { describe, expect, it } from "vitest";

import { publishInputSchema } from "./publishVideo";

const base = { title: "Trần Đức", mirrors: [{ host: "dood", fileCode: "abc" }] };

describe("publishInputSchema", () => {
  it("accepts the minimum and defaults to a draft", () => {
    expect(publishInputSchema.parse(base)).toMatchObject({ ...base, publish: false });
  });

  it.each([
    ["no mirrors", { ...base, mirrors: [] }],
    ["unknown field", { ...base, categry: "typo" }],
    ["both thumbnails", { ...base, thumbnailUrl: "https://x.test/a.jpg", thumbnailDataUrl: "data:image/png;base64,AA==" }],
    ["non-image data URL", { ...base, thumbnailDataUrl: "data:text/html;base64,PGgxPg==" }],
    ["non-http thumbnail URL", { ...base, thumbnailUrl: "file:///etc/passwd" }],
    ["bad quality", { ...base, quality: "8K" }],
    ["too many tags", { ...base, tags: Array.from({ length: 41 }, (_, i) => `t${i}`) }],
  ])("rejects %s", (_label, input) => {
    expect(publishInputSchema.safeParse(input).success).toBe(false);
  });
});
