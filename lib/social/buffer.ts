// A small client for Buffer's GraphQL API (https://developers.buffer.com).
// Only what posting to X needs: find the channel, list its recent posts (one
// request per worker cycle), create a video post. The API key never appears
// in errors or logs.

const ENDPOINT = "https://api.buffer.com";
const THIRTY_DAYS = 2_592_000;
const PAGE_SIZE = 100;
/** Pages per read: 500 posts, far more than a 10-post queue needs. */
const MAX_PAGES = 5;

export type BufferPost = {
  id: string;
  status: "draft" | "error" | "needs_approval" | "scheduled" | "sending" | "sent";
  text: string;
  dueAt: string | null;
  sentAt: string | null;
  externalLink: string | null;
  error: { message: string } | null;
};

export type BufferChannel = { channelId: string; organizationId: string };

export type CreateResult =
  | { ok: true; postId: string; dueAt: string | null }
  // Buffer refused the post (a typed MutationError): the message says why.
  | { ok: false; message: string };

export interface BufferApi {
  /** Read-only GraphQL query, for diagnostics (social:probe). */
  query?<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  findXChannel(handle: string): Promise<BufferChannel>;
  /**
   * Every post of the channel (any status), following pages up to MAX_PAGES.
   * `complete`: the list holds them all; `requests`: pages read.
   */
  channelPosts(
    channel: BufferChannel,
  ): Promise<{ posts: BufferPost[]; remaining30d: number | null; complete?: boolean; requests?: number }>;
  createVideoPost(channelId: string, text: string, videoUrl: string): Promise<CreateResult>;
}

/**
 * `retryable`: rate limit, outage or network trouble; try again next cycle.
 * Otherwise (bad key, no permission, channel not found) a person must act.
 * `sent`: the request may have reached Buffer (outcome unknown).
 */
export class BufferError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly sent = false,
  ) {
    super(message);
  }
}

/** Requests left in the 30-day window, from the RateLimit headers. */
export function remainingIn30Days(headers: Headers): number | null {
  const policies = headers.get("ratelimit-policy");
  const limits = headers.get("ratelimit");
  if (!policies || !limits) return null;
  const windowByName = new Map<string, number>();
  for (const match of policies.matchAll(/"([^"]+)"\s*;[^,]*?\bw=(\d+)/g)) {
    windowByName.set(match[1], Number(match[2]));
  }
  for (const match of limits.matchAll(/"([^"]+)"\s*;[^,]*?\br=(\d+)/g)) {
    if (windowByName.get(match[1]) === THIRTY_DAYS) return Number(match[2]);
  }
  return null;
}

type PostsResults = {
  edges: { node: BufferPost }[] | null;
  pageInfo?: { hasNextPage: boolean; endCursor: string | null } | null;
};

type GraphQLResponse<T> = { data?: T; errors?: { message?: string; extensions?: { code?: string } }[] };

export function bufferClient(apiKey: string, fetchImpl: typeof fetch = fetch): BufferApi {
  async function request<T>(
    query: string,
    variables: Record<string, unknown> = {},
    mutation = false,
  ): Promise<{ data: T; headers: Headers }> {
    let response: Response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      // A mutation may have reached Buffer before the connection failed.
      throw new BufferError(
        `Buffer unreachable: ${error instanceof Error ? error.name : "error"}`,
        "NETWORK",
        true,
        mutation,
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw new BufferError(`Buffer HTTP ${response.status}`, "HTTP", true, mutation && response.status >= 500);
    }
    if (response.status === 401 || response.status === 403) {
      throw new BufferError("Buffer rejected the API key (BUFFER_API_KEY)", "UNAUTHORIZED", false);
    }
    let body: GraphQLResponse<T>;
    try {
      body = (await response.json()) as GraphQLResponse<T>;
    } catch {
      throw new BufferError(`Buffer HTTP ${response.status}: not JSON`, "HTTP", true, mutation);
    }
    if (body.errors?.length) {
      const code = body.errors[0].extensions?.code ?? "UNKNOWN";
      const message = (body.errors[0].message ?? "error").slice(0, 300);
      const retryable = code === "RATE_LIMIT_EXCEEDED" || code === "UNEXPECTED";
      throw new BufferError(`Buffer ${code}: ${message}`, code, retryable);
    }
    if (!body.data) throw new BufferError("Buffer returned no data", "UNEXPECTED", true, mutation);
    return { data: body.data, headers: response.headers };
  }

  return {
    async query<T>(query: string, variables: Record<string, unknown> = {}) {
      return (await request<T>(query, variables)).data;
    },

    async findXChannel(handle) {
      const wanted = handle.replace(/^@/, "").toLowerCase();
      const { data } = await request<{ account: { organizations: { id: string }[] } }>(
        "query { account { organizations { id } } }",
      );
      for (const { id } of data.account.organizations) {
        const result = await request<{
          channels: { id: string; name: string; service: string; organizationId: string }[];
        }>(
          "query Channels($input: ChannelsInput!) { channels(input: $input) { id name service organizationId } }",
          { input: { organizationId: id } },
        );
        const channel = result.data.channels.find(
          (item) => item.service === "twitter" && item.name.replace(/^@/, "").toLowerCase() === wanted,
        );
        if (channel) return { channelId: channel.id, organizationId: channel.organizationId };
      }
      throw new BufferError(`No X channel @${handle} in this Buffer account`, "NOT_FOUND", false);
    },

    async channelPosts(channel) {
      // Channel and status only. With a startDate (and dueAt sort) Buffer
      // returned no posts at all, so every post looked deleted ("No longer
      // in Buffer"); social:probe showed the channel-only query lists them
      // all. Pages are followed (each one a request) up to MAX_PAGES.
      const posts: BufferPost[] = [];
      let remaining30d: number | null = null;
      let after: string | null = null;
      let requests = 0;
      let complete = false;
      while (requests < MAX_PAGES) {
        const response: { data: { posts: PostsResults | PostsResults[] | null }; headers: Headers } = await request<{
          posts: PostsResults | PostsResults[] | null;
        }>(
          `query ChannelPosts($input: PostsInput!, $first: Int, $after: String) {
            posts(input: $input, first: $first, after: $after) {
              edges { node { id status text dueAt sentAt externalLink error { message } } }
              pageInfo { hasNextPage endCursor }
            }
          }`,
          {
            first: PAGE_SIZE,
            ...(after ? { after } : {}),
            input: {
              organizationId: channel.organizationId,
              filter: {
                channelIds: [channel.channelId],
                status: ["draft", "needs_approval", "scheduled", "sending", "sent", "error"],
              },
            },
          },
        );
        requests += 1;
        const { data, headers } = response;
        remaining30d = remainingIn30Days(headers) ?? remaining30d;
        const pages: PostsResults[] = Array.isArray(data.posts) ? data.posts : data.posts ? [data.posts] : [];
        for (const edge of pages.flatMap((page) => page?.edges ?? [])) {
          // GraphQL enums may come back upper case ("SENT"); the queue
          // compares lower case.
          posts.push({ ...edge.node, status: String(edge.node.status ?? "").toLowerCase() as BufferPost["status"] });
        }
        const info: PostsResults["pageInfo"] = pages[pages.length - 1]?.pageInfo;
        if (!info?.hasNextPage || !info.endCursor) {
          // No pageInfo at all: complete only if the page was not full.
          complete = info ? true : posts.length < PAGE_SIZE * requests;
          break;
        }
        after = info.endCursor;
      }
      return { posts, remaining30d, complete, requests };
    },

    async createVideoPost(channelId, text, videoUrl) {
      const { data } = await request<{
        createPost: { post?: { id: string; dueAt?: string | null }; message?: string };
      }>(
        `mutation CreatePost($input: CreatePostInput!) {
          createPost(input: $input) {
            ... on PostActionSuccess { post { id dueAt } }
            ... on MutationError { message }
          }
        }`,
        {
          input: {
            channelId,
            text,
            schedulingType: "automatic",
            mode: "addToQueue",
            assets: [{ video: { url: videoUrl } }],
          },
        },
        true,
      );
      if (data.createPost.post?.id) {
        return { ok: true, postId: data.createPost.post.id, dueAt: data.createPost.post.dueAt ?? null };
      }
      return { ok: false, message: (data.createPost.message ?? "Buffer refused the post").slice(0, 500) };
    },
  };
}
