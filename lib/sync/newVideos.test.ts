import { describe, expect, it } from "vitest";

import type { HostProvider } from "../hosts/types";
import { buildPrimaryVideoData, migrationTagRepairs } from "./newVideos";

const provider: HostProvider = {
  id: "example",
  label: "Example",
  embedDomains: ["example.invalid"],
  async listFiles() {
    return { files: [], hasMore: false };
  },
  async getFileInfo() {
    return null;
  },
  embedUrl(code) {
    return `https://example.invalid/e/${code}`;
  },
};

describe("new video creation", () => {
  it("creates an unpublished video with a PRIMARY mirror from the current DB-selected host", () => {
    const data = buildPrimaryVideoData(
      "current-primary",
      provider,
      {
        code: "file-123",
        title: "Beach_Weekend.mp4",
        lengthSeconds: 602,
        thumbnailUrl: "https://img.invalid/file-123.jpg",
        uploadedAt: null,
      },
      "beach-weekend",
    );

    expect(data).toMatchObject({
      slug: "beach-weekend",
      title: "Beach Weekend",
      status: "AVAILABLE",
      isPublished: false,
      isHidden: false,
      mirrors: {
        create: {
          hostId: "current-primary",
          fileCode: "file-123",
          normalizedName: "beach weekend",
          status: "OK",
          matchedBy: "PRIMARY",
        },
      },
    });
    expect(data.mirrors.create.embedUrl).toBe(
      "https://example.invalid/e/file-123",
    );
  });

  it("attaches migration tag links when provided", () => {
    const data = buildPrimaryVideoData(
      "current-primary",
      provider,
      {
        code: "file-123",
        title: "Beach_Weekend.mp4",
        lengthSeconds: 602,
        thumbnailUrl: null,
        uploadedAt: null,
      },
      "beach-weekend",
      [{ tagId: "tag-1" }, { tagId: "tag-2" }],
    );

    expect(data).toMatchObject({
      videoTags: {
        create: [{ tagId: "tag-1" }, { tagId: "tag-2" }],
      },
    });
  });
});

describe("migration tag repair for existing videos", () => {
  const tagsByHostCode = new Map([
    ["code-a", ["Gay video", "Vietnam video"]],
    ["code-b", ["Asia video"]],
  ]);

  it("tags an existing untagged video once its file code appears in the migration log", () => {
    expect(
      migrationTagRepairs(
        [{ videoId: "v1", fileCode: "code-a", tagCount: 0 }],
        tagsByHostCode,
      ),
    ).toEqual([
      { videoId: "v1", fileCode: "code-a", tags: ["Gay video", "Vietnam video"] },
    ]);
  });

  it("leaves videos that already have tags untouched so admin edits win", () => {
    expect(
      migrationTagRepairs(
        [{ videoId: "v1", fileCode: "code-a", tagCount: 1 }],
        tagsByHostCode,
      ),
    ).toEqual([]);
  });

  it("skips files without migration tags and repairs each video only once", () => {
    expect(
      migrationTagRepairs(
        [
          { videoId: "v1", fileCode: "unknown", tagCount: 0 },
          { videoId: "v2", fileCode: "code-b", tagCount: 0 },
          { videoId: "v2", fileCode: "code-a", tagCount: 0 },
        ],
        tagsByHostCode,
      ),
    ).toEqual([{ videoId: "v2", fileCode: "code-b", tags: ["Asia video"] }]);
  });
});
