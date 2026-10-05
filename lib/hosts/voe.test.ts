import { describe, expect, it, vi } from "vitest";

import listFixture from "./__fixtures__/voe-list.json";
import infoFixture from "./__fixtures__/voe-info.json";
import { createVoeProvider } from "./voe";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("VOE provider", () => {
  it("maps the documented paginated file-list response", async () => {
    let requestedUrl = "";
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      requestedUrl = String(input);
      return jsonResponse(listFixture);
    });
    const provider = createVoeProvider({
      apiKey: "test-key",
      fetchImpl,
      minIntervalMs: 0,
    });

    await expect(provider.listFiles({ page: 1, perPage: 20 })).resolves.toEqual({
      files: [
        {
          code: "abc123456789",
          title: "Test.mp4",
          lengthSeconds: null,
          thumbnailUrl:
            "https://i.voe.sx/cache/abc123456789_storyboard_L0.jpg",
          uploadedAt: "2023-03-31T00:00:00.000Z",
        },
      ],
      hasMore: true,
    });

    const requested = new URL(requestedUrl);
    expect(requested.pathname).toBe("/api/file/list");
    expect(requested.searchParams.get("per_page")).toBe("20");
  });

  it("maps file info and uses the documented /e/ embed URL", async () => {
    const provider = createVoeProvider({
      apiKey: "test-key",
      fetchImpl: vi.fn(async () => jsonResponse(infoFixture)),
      minIntervalMs: 0,
    });

    await expect(provider.getFileInfo("abc123456789")).resolves.toEqual({
      code: "abc123456789",
      title: "test.mp4",
      lengthSeconds: 6,
      thumbnailUrl:
            "https://i.voe.sx/cache/abc123456789_storyboard_L0.jpg",
      uploadedAt: null,
    });
    expect(provider.embedUrl("abc123456789")).toBe(
      "https://voe.sx/e/abc123456789",
    );
  });

  it("treats a per-file 404 as missing", async () => {
    const fixture = {
      ...infoFixture,
      result: [{ status: 404, fileCode: "missing-code" }],
    };
    const provider = createVoeProvider({
      apiKey: "test-key",
      fetchImpl: vi.fn(async () => jsonResponse(fixture)),
      minIntervalMs: 0,
    });

    await expect(provider.getFileInfo("missing-code")).resolves.toBeNull();
  });
});
