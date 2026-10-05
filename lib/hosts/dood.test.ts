import { describe, expect, it, vi } from "vitest";

import listFixture from "./__fixtures__/dood-list.json";
import infoFixture from "./__fixtures__/dood-info.json";
import { createDoodProvider } from "./dood";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("DoodStream provider", () => {
  it("maps the documented file-list response", async () => {
    let requestedUrl = "";
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      requestedUrl = String(input);
      return jsonResponse(listFixture);
    });
    const provider = createDoodProvider({
      apiKey: "test-key",
      fetchImpl,
      minIntervalMs: 0,
    });

    await expect(provider.listFiles({ page: 1, perPage: 500 })).resolves.toEqual({
      files: [
        {
          code: "xxx",
          title: "test_file.mp4",
          lengthSeconds: 1234,
          thumbnailUrl: "https://img.doodcdn.io/snaps/xxx.jpg",
          uploadedAt: "2017-08-11T04:30:07.000Z",
        },
      ],
      hasMore: true,
    });

    const requested = new URL(requestedUrl);
    expect(requested.pathname).toBe("/api/file/list");
    expect(requested.searchParams.get("per_page")).toBe("200");
    expect(provider.embedUrl("abc123")).toBe(
      "https://dood.to/e/abc123",
    );
  });

  it("maps file info and exposes the documented embed shape", async () => {
    const provider = createDoodProvider({
      apiKey: "test-key",
      fetchImpl: vi.fn(async () => jsonResponse(infoFixture)),
      minIntervalMs: 0,
    });

    await expect(provider.getFileInfo("xxx")).resolves.toMatchObject({
      code: "xxx",
      lengthSeconds: 1234,
    });
    expect(provider.embedUrl("xxx")).toBe(
      "https://playmogo.com/e/yyy",
    );
    expect(provider.embedUrl("abc123")).toBe(
      "https://playmogo.com/e/abc123",
    );
    expect(provider.embedDomains).toContain("playmogo.com");
    expect(provider.embedDomains).toContain("dood.so");
  });

  it("keeps an operator-configured HTTPS embed base", async () => {
    const provider = createDoodProvider({
      apiKey: "test-key",
      embedBaseUrl: "https://current-dood.example/path-is-ignored",
      fetchImpl: vi.fn(async () => jsonResponse(listFixture)),
      minIntervalMs: 0,
    });

    await provider.listFiles({ page: 1, perPage: 20 });

    expect(provider.embedUrl("abc123")).toBe(
      "https://current-dood.example/e/abc123",
    );
    expect(provider.embedDomains).toContain("current-dood.example");
  });

  it("uses an absolute protected embed origin returned by file info", async () => {
    const provider = createDoodProvider({
      apiKey: "test-key",
      fetchImpl: vi.fn(async () =>
        jsonResponse({
          status: 200,
          result: [
            {
              status: 200,
              filecode: "xxx",
              title: "test.mp4",
              protected_embed: "https://fresh-dood.example/e/protected",
            },
          ],
        }),
      ),
      minIntervalMs: 0,
    });

    await provider.getFileInfo("xxx");

    expect(provider.embedUrl("xxx")).toBe(
      "https://fresh-dood.example/e/protected",
    );
    expect(provider.embedDomains).toContain("fresh-dood.example");
  });

  it("rejects a non-HTTPS embed base", () => {
    expect(() =>
      createDoodProvider({
        apiKey: "test-key",
        embedBaseUrl: "http://example.com",
        minIntervalMs: 0,
      }),
    ).toThrow("DoodStream embed base must use https.");
  });

  it("retries retryable HTTP failures with backoff", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse(listFixture));
    const sleep = vi.fn(async () => undefined);
    const provider = createDoodProvider({
      apiKey: "test-key",
      fetchImpl,
      sleep,
      minIntervalMs: 0,
      retryBaseMs: 5,
    });

    await provider.listFiles({ page: 1, perPage: 20 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5);
  });
});
