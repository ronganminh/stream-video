import { describe, expect, it, vi } from "vitest";

import listFixture from "./__fixtures__/earnvids-list.json";
import infoFixture from "./__fixtures__/earnvids-info.json";
import { createEarnVidsProvider } from "./earnvids";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("EarnVids provider", () => {
  it("maps the documented file-list response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(listFixture));
    const provider = createEarnVidsProvider({
      apiKey: "test-key",
      fetchImpl,
      minIntervalMs: 0,
    });

    await expect(provider.listFiles({ page: 1, perPage: 50 })).resolves.toEqual({
      files: [
        {
          code: "fb5asfuj2snh",
          title: "Test 123.mp4",
          lengthSeconds: 60,
          thumbnailUrl: "http://img.xvs.tt/fb5asfuj2snh_t.jpg",
          uploadedAt: "2021-07-12T20:56:54.000Z",
        },
      ],
      hasMore: true,
    });

    const requested = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requested.hostname).toBe("earnvidsapi.com");
    expect(requested.pathname).toBe("/api/file/list");
  });

  it("maps documented file info", async () => {
    const provider = createEarnVidsProvider({
      apiKey: "test-key",
      fetchImpl: vi.fn(async () => jsonResponse(infoFixture)),
      minIntervalMs: 0,
    });

    await expect(provider.getFileInfo("fb5asfuj2snh")).resolves.toEqual({
      code: "fb5asfuj2snh",
      title: "big buck bunny.mp4",
      lengthSeconds: 60,
      thumbnailUrl: "http://img.xvs.tt/fb5asfuj2snh.jpg",
      uploadedAt: "2021-08-12T20:51:52.000Z",
    });
  });

  it("uses the current host-provided embed domain shape", () => {
    const provider = createEarnVidsProvider({ apiKey: "test-key" });

    expect(provider.embedDomains).toEqual(["morencius.com"]);
    expect(provider.embedUrl("fb5asfuj2snh")).toBe(
      "https://morencius.com/embed/fb5asfuj2snh",
    );
  });
});
