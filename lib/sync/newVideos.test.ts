import { describe, expect, it } from "vitest";

import type { HostProvider } from "../hosts/types";
import { buildPrimaryVideoData } from "./newVideos";

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
});
