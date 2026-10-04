import { describe, expect, it } from "vitest";

import {
  normalizeRemoteThumbnailUrl,
  selectedThumbnailSettingKey,
  sourceThumbnailSettingKey,
} from "./thumbnailSources";

describe("thumbnail source helpers", () => {
  it("uses namespaced Setting keys without changing the schema", () => {
    expect(sourceThumbnailSettingKey("video-1")).toBe(
      "video-source-thumbnail:video-1",
    );
    expect(selectedThumbnailSettingKey("video-1")).toBe(
      "video-thumbnail-selected:video-1",
    );
  });

  it("accepts http(s) thumbnail URLs only", () => {
    expect(
      normalizeRemoteThumbnailUrl("https://example.com/thumb.jpg"),
    ).toBe("https://example.com/thumb.jpg");
    expect(
      normalizeRemoteThumbnailUrl("http://example.com/thumb.jpg"),
    ).toBe("http://example.com/thumb.jpg");

    expect(() =>
      normalizeRemoteThumbnailUrl("file:///tmp/thumb.jpg"),
    ).toThrow("Thumbnail URL must use http or https.");
  });
});
