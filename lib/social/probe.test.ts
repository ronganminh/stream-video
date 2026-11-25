import { afterEach, describe, expect, it } from "vitest";

import { runBufferProbe } from "./probe";

const KEY = "probe-secret-key";

function fakeClient() {
  return {
    setting: { findUnique: async () => ({ value: { channelId: "tw", organizationId: "o2" } }) },
    socialPost: { findMany: async () => [{ bufferPostId: "p1", pushedAt: new Date("2026-11-25T10:00:00Z") }] },
  } as never;
}

describe("social:probe", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("prints counts and statuses only, never post text or the key", async () => {
    process.env.BUFFER_API_KEY = KEY;
    delete process.env.BUFFER_X_CHANNEL_ID;
    delete process.env.BUFFER_ORGANIZATION_ID;
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      const { query } = JSON.parse(init.body) as { query: string };
      let data: unknown;
      if (query.includes("account")) data = { account: { organizations: [{ id: "o2" }] } };
      else if (query.includes("channels")) data = { channels: [{ id: "tw", name: "Gayvideofun", service: "twitter", organizationId: "o2" }] };
      else if (query.includes("post(input")) data = { post: { id: "p1", status: "scheduled", channelId: "tw" } };
      else data = { posts: { edges: [{ node: { id: "p1", status: "scheduled", dueAt: null, text: "SECRET TEXT" } }] } };
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const lines: string[] = [];
    expect(await runBufferProbe({ client: fakeClient(), log: (line) => lines.push(line), fetchImpl })).toBe(0);
    const out = lines.join("\n");
    expect(out).toContain("channel=true org=true");
    expect(out).toContain("A worker's query: shape=object posts=1 ours=1 [scheduled=1]");
    expect(out).toContain("F newest of ours by id: status=scheduled sameChannel=true");
    expect(out).not.toContain("SECRET TEXT");
    expect(out).not.toContain(KEY);
  });
});
