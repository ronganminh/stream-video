import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { BufferError, bufferClient } from "./buffer";
import { socialConfig } from "./config";
import { X_NETWORK } from "./queue";

// social:probe — why does the worker's Buffer read come back empty?
// Read-only: a handful of GraphQL queries (no mutation). Prints counts and
// statuses only: no post text, no link, no key.

const CHANNEL_SETTING = "social.x.bufferChannel";
const NODE = "id status dueAt";

type Variant = { name: string; filter: Record<string, unknown> | null; sort?: unknown };

function shape(posts: unknown): { kind: string; nodes: { id: string; status: string }[] } {
  const pages = Array.isArray(posts) ? posts : posts ? [posts] : [];
  const nodes = pages.flatMap((page) => ((page as { edges?: { node: { id: string; status: string } }[] })?.edges ?? []).map((e) => e.node));
  return { kind: Array.isArray(posts) ? "list" : posts === null ? "null" : typeof posts, nodes };
}

export async function runBufferProbe(
  options: { client?: Pick<PrismaClient, "setting" | "socialPost">; log?: (line: string) => void; fetchImpl?: typeof fetch } = {},
): Promise<number> {
  const client = options.client ?? prisma;
  const log = options.log ?? ((line: string) => console.info(line));
  const config = socialConfig();
  if (!config.enabled) {
    log("BUFFER_API_KEY is not set");
    return 1;
  }
  const api = bufferClient(config.apiKey, options.fetchImpl);
  const run = api.query!.bind(api);

  // Where the worker's channel comes from, and whether it matches Buffer's.
  const saved = (await client.setting.findUnique({ where: { key: CHANNEL_SETTING } }))?.value as
    | { channelId?: string; organizationId?: string }
    | undefined;
  const fromEnv = Boolean(config.channelId && config.organizationId);
  const used = fromEnv
    ? { channelId: config.channelId!, organizationId: config.organizationId! }
    : { channelId: saved?.channelId ?? "", organizationId: saved?.organizationId ?? "" };
  let found: { channelId: string; organizationId: string } | null = null;
  try {
    found = await api.findXChannel(config.xHandle);
  } catch (error) {
    log(`channel lookup failed: ${error instanceof BufferError ? error.message : "error"}`);
  }
  log(
    `channel source: ${fromEnv ? "env" : saved ? "saved setting" : "none"}; ` +
      `matches Buffer's @${config.xHandle}: channel=${found ? found.channelId === used.channelId : "?"} org=${found ? found.organizationId === used.organizationId : "?"}`,
  );
  const channel = found ?? used;

  const ours = await client.socialPost.findMany({
    where: { network: X_NETWORK, bufferPostId: { not: null } },
    select: { bufferPostId: true, pushedAt: true },
    orderBy: { pushedAt: "desc" },
    take: 50,
  });
  const ourIds = new Set(ours.map((row) => row.bufferPostId!));
  const oldest = ours.reduce((min, row) => Math.min(min, (row.pushedAt ?? new Date()).getTime()), Date.now());
  const since = new Date(oldest - 24 * 3600_000).toISOString();
  log(`our posts with a Buffer id: ${ours.length}; oldest pushed ${new Date(oldest).toISOString().slice(0, 16)}Z`);

  const all = ["draft", "needs_approval", "scheduled", "sending", "sent", "error"];
  const variants: Variant[] = [
    { name: "A worker's query", filter: { channelIds: [channel.channelId], startDate: since, status: all }, sort: [{ field: "dueAt", direction: "desc" }] },
    { name: "B channel only", filter: { channelIds: [channel.channelId] } },
    { name: "C channel + scheduled", filter: { channelIds: [channel.channelId], status: ["scheduled"] } },
    { name: "D channel + sent", filter: { channelIds: [channel.channelId], status: ["sent"] } },
    { name: "E organization only", filter: null },
  ];
  for (const variant of variants) {
    const input: Record<string, unknown> = { organizationId: channel.organizationId };
    if (variant.filter) input.filter = variant.filter;
    if (variant.sort) input.sort = variant.sort;
    try {
      const data = await run<{ posts: unknown }>(
        `query Probe($input: PostsInput!, $first: Int) { posts(input: $input, first: $first) { edges { node { ${NODE} } } } }`,
        { first: 100, input },
      );
      const { kind, nodes } = shape(data.posts);
      const byStatus = new Map<string, number>();
      for (const node of nodes) byStatus.set(String(node.status), (byStatus.get(String(node.status)) ?? 0) + 1);
      const mine = nodes.filter((node) => ourIds.has(node.id)).length;
      log(`${variant.name}: shape=${kind} posts=${nodes.length} ours=${mine} [${[...byStatus].map(([k, v]) => `${k}=${v}`).join(" ")}]`);
    } catch (error) {
      log(`${variant.name}: ERROR ${error instanceof BufferError ? error.message : "request failed"}`);
    }
  }

  // One of our posts, looked up by id.
  const one = ours[0]?.bufferPostId;
  if (one) {
    try {
      const data = await run<{ post: { id: string; status: string; channelId?: string } | null }>(
        `query One($input: PostInput!) { post(input: $input) { id status channelId } }`,
        { input: { id: one } },
      );
      log(`F newest of ours by id: ${data.post ? `status=${data.post.status} sameChannel=${data.post.channelId === channel.channelId}` : "not found"}`);
    } catch (error) {
      log(`F newest of ours by id: ERROR ${error instanceof BufferError ? error.message : "request failed"}`);
    }
  }
  return 0;
}
