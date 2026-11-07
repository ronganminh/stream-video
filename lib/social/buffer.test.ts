import { describe, expect, it } from "vitest";

import { bufferClient, BufferError, remainingIn30Days } from "./buffer";

const KEY = "buf_SECRET_KEY_123";

function fakeFetch(responses: { status?: number; body: unknown; headers?: Record<string, string> }[]) {
  const requests: { body: { query: string; variables: Record<string, unknown> }; headers: Headers }[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    requests.push({ body: JSON.parse(String(init.body)), headers: new Headers(init.headers) });
    const next = responses.shift()!;
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: next.headers });
  }) as unknown as typeof fetch;
  return { impl, requests };
}

describe("remainingIn30Days", () => {
  it("picks the 30-day window by its length, not its name", () => {
    const headers = new Headers({
      ratelimit: '"150-in-15min";r=98;t=897, "600-in-1day";r=598;t=86397, "1000-in-30days";r=969;t=696980',
      "ratelimit-policy":
        '"150-in-15min";q=150;w=900, "600-in-1day";q=600;w=86400, "1000-in-30days";q=1000;w=2592000',
    });
    expect(remainingIn30Days(headers)).toBe(969);
    expect(remainingIn30Days(new Headers())).toBeNull();
  });
});

describe("bufferClient", () => {
  it("creates a queued X video post with the key as a bearer token", async () => {
    const { impl, requests } = fakeFetch([{ body: { data: { createPost: { post: { id: "p1" } } } } }]);
    const result = await bufferClient(KEY, impl).createVideoPost("chan", "Hello\n\nhttps://x.test", "https://m.test/c.mp4");
    expect(result).toEqual({ ok: true, postId: "p1" });
    expect(requests[0].headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(requests[0].body.variables.input).toEqual({
      channelId: "chan",
      text: "Hello\n\nhttps://x.test",
      schedulingType: "automatic",
      mode: "addToQueue",
      assets: [{ video: { url: "https://m.test/c.mp4" } }],
    });
  });

  it("returns Buffer's refusal message", async () => {
    const { impl } = fakeFetch([{ body: { data: { createPost: { message: "Queue limit reached" } } } }]);
    expect(await bufferClient(KEY, impl).createVideoPost("c", "t", "u")).toEqual({
      ok: false,
      message: "Queue limit reached",
    });
  });

  it("classifies errors and never puts the key in a message", async () => {
    const cases = [
      { response: { body: { errors: [{ message: "Not authorized", extensions: { code: "UNAUTHORIZED" } }] } }, retryable: false },
      { response: { body: { errors: [{ message: "slow down", extensions: { code: "RATE_LIMIT_EXCEEDED" } }] } }, retryable: true },
      { response: { status: 503, body: {} }, retryable: true },
      { response: { status: 401, body: {} }, retryable: false },
    ];
    for (const { response, retryable } of cases) {
      const { impl } = fakeFetch([response]);
      const error = await bufferClient(KEY, impl)
        .channelPosts({ channelId: "c", organizationId: "o" }, new Date())
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BufferError);
      expect((error as BufferError).retryable).toBe(retryable);
      expect((error as BufferError).message).not.toContain(KEY);
    }
  });

  it("finds the X channel by handle across organizations", async () => {
    const { impl } = fakeFetch([
      { body: { data: { account: { organizations: [{ id: "o1" }, { id: "o2" }] } } } },
      { body: { data: { channels: [{ id: "fb", name: "Gayvideofun", service: "facebook", organizationId: "o1" }] } } },
      { body: { data: { channels: [{ id: "tw", name: "gayvideofun", service: "twitter", organizationId: "o2" }] } } },
    ]);
    expect(await bufferClient(KEY, impl).findXChannel("@Gayvideofun")).toEqual({
      channelId: "tw",
      organizationId: "o2",
    });
  });
});
