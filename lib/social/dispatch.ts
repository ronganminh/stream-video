import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { socialConfig, type SocialConfig } from "./config";
import { X_NETWORK } from "./queue";

// Starts the GitHub Actions clip workflow (.github/workflows/x-clips.yml)
// through the GitHub API, event-driven (no cron):
// - approving a video with an X clip records a request (requestClipRun);
// - the worker (every minute) dispatches once no approval came for
//   X_CLIPS_DEBOUNCE_SECONDS, so a burst of approvals starts one run, which
//   handles every pending post;
// - while a run is queued or in progress nothing is dispatched (the workflow
//   also has a concurrency group); posts approved meanwhile get the next run;
// - "Chạy cắt clip ngay" in /admin/review dispatches without waiting.
// Failures are stored and shown in the admin; they never affect the web.
// The token is never logged or stored: messages carry HTTP status codes only.

export const DISPATCH_SETTING = "social.x.clipDispatch";
const ERROR_RETRY_MS = 5 * 60_000;
/** GitHub may take a while to list a just-dispatched run. */
const DISPATCH_GRACE_MS = 3 * 60_000;
/** Retries (failed attempts coming due) re-dispatch at most this often. */
const AUTO_REQUEST_MS = 30 * 60_000;

export type DispatchState = {
  state: "idle" | "waiting" | "running" | "dispatched" | "error";
  /** An approval or retry is waiting for a run. */
  requestedAt: string | null;
  /** The last approval: the debounce counts from here. */
  lastApprovalAt: string | null;
  dispatchedAt: string | null;
  message: string | null;
  /** After an error, do not call GitHub again before this. */
  retryAt: string | null;
};

const EMPTY: DispatchState = {
  state: "idle",
  requestedAt: null,
  lastApprovalAt: null,
  dispatchedAt: null,
  message: null,
  retryAt: null,
};

type Db = Pick<PrismaClient, "setting" | "socialPost">;

export async function readDispatchState(client: Pick<PrismaClient, "setting"> = prisma): Promise<DispatchState> {
  const row = await client.setting.findUnique({ where: { key: DISPATCH_SETTING } });
  const value = (row?.value ?? {}) as Partial<DispatchState>;
  return { ...EMPTY, ...value };
}

async function writeDispatchState(client: Pick<PrismaClient, "setting">, state: DispatchState): Promise<void> {
  const value = state as unknown as object;
  await client.setting.upsert({
    where: { key: DISPATCH_SETTING },
    create: { key: DISPATCH_SETTING, value },
    update: { value },
  });
}

/** Called when an approval queues an X clip: the worker dispatches after the debounce. */
export async function requestClipRun(now = new Date(), client: Pick<PrismaClient, "setting"> = prisma): Promise<void> {
  const current = await readDispatchState(client);
  await writeDispatchState(client, {
    ...current,
    state: current.state === "running" ? "running" : "waiting",
    requestedAt: current.requestedAt ?? now.toISOString(),
    lastApprovalAt: now.toISOString(),
  });
}

export type GitHubActions = {
  /** Number of runs of the workflow that are queued or in progress. */
  activeRuns(): Promise<number>;
  dispatch(): Promise<void>;
};

export class GitHubError extends Error {}

/** Minimal GitHub REST client for one workflow; errors never include the token. */
export function gitHubActions(config: SocialConfig["dispatch"], fetchImpl: typeof fetch = fetch): GitHubActions {
  const base = `https://api.github.com/repos/${config.repository}/actions/workflows/${encodeURIComponent(config.workflow)}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gayvideo-worker",
  };
  const call = async (url: string, init: RequestInit = {}) => {
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new GitHubError("không kết nối được GitHub");
    }
    if (!response.ok) {
      const hint =
        response.status === 401
          ? "token sai hoặc hết hạn"
          : response.status === 403
            ? "token thiếu quyền Actions: write trên repo này, hoặc bị giới hạn tốc độ"
            : response.status === 404
              ? "không thấy repo/workflow (kiểm tra token có quyền đúng repo và workflow đã có trên nhánh)"
              : response.status === 422
                ? "workflow không nhận workflow_dispatch trên nhánh này"
                : "lỗi từ GitHub";
      throw new GitHubError(`GitHub HTTP ${response.status}: ${hint}`);
    }
    return response;
  };
  return {
    async activeRuns() {
      let total = 0;
      for (const status of ["queued", "in_progress"]) {
        const response = await call(`${base}/runs?status=${status}&per_page=1`);
        const body = (await response.json()) as { total_count?: number };
        total += body.total_count ?? 0;
      }
      return total;
    },
    async dispatch() {
      await call(`${base}/dispatches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: config.ref }),
      });
    },
  };
}

async function duePosts(client: Db, now: Date): Promise<number> {
  return client.socialPost.count({
    where: {
      network: X_NETWORK,
      status: "preparing",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
  });
}

export type DispatchOutcome =
  | "idle"
  | "debounce"
  | "backoff"
  | "running"
  | "dispatched"
  | "error";

/**
 * One worker tick (or `immediate` for the admin button). Calls GitHub at
 * most twice: one runs listing, one dispatch.
 */
export async function runClipDispatch(
  options: { now?: Date; client?: Db; config?: SocialConfig; github?: GitHubActions; immediate?: boolean } = {},
): Promise<{ outcome: DispatchOutcome; state: DispatchState }> {
  const now = options.now ?? new Date();
  const client = options.client ?? prisma;
  const config = options.config ?? socialConfig();
  let state = await readDispatchState(client);
  const save = async (next: DispatchState, outcome: DispatchOutcome) => {
    state = next;
    await writeDispatchState(client, next);
    return { outcome, state: next };
  };

  const due = await duePosts(client, now);
  if (!due) {
    if (state.state === "idle" && !state.requestedAt) return { outcome: "idle", state };
    // Nothing to cut: a finished run leaves no request behind.
    return save({ ...state, state: state.state === "error" ? "error" : "idle", requestedAt: null }, "idle");
  }

  if (!state.requestedAt) {
    // Posts are due but nobody asked (retries after a failure, or a run that
    // ended early). Ask again, but not more often than every 30 minutes.
    const last = state.dispatchedAt ? Date.parse(state.dispatchedAt) : 0;
    if (!options.immediate && now.getTime() - last < AUTO_REQUEST_MS) return { outcome: "backoff", state };
    state = { ...state, requestedAt: now.toISOString(), lastApprovalAt: state.lastApprovalAt };
  }

  if (!options.immediate) {
    const lastApproval = state.lastApprovalAt ? Date.parse(state.lastApprovalAt) : 0;
    if (now.getTime() - lastApproval < config.dispatch.debounceSeconds * 1000) {
      return save({ ...state, state: state.state === "running" ? "running" : "waiting" }, "debounce");
    }
    if (state.state === "error" && state.retryAt && Date.parse(state.retryAt) > now.getTime()) {
      return { outcome: "backoff", state };
    }
    if (state.state === "dispatched" && state.dispatchedAt && now.getTime() - Date.parse(state.dispatchedAt) < DISPATCH_GRACE_MS) {
      return { outcome: "running", state };
    }
  }

  if (!config.dispatch.token) {
    return save(
      {
        ...state,
        state: "error",
        message: "Chưa cấu hình GAYVIDEO_CLIP_DISPATCH trên server: không gọi được workflow cắt clip.",
        retryAt: new Date(now.getTime() + ERROR_RETRY_MS).toISOString(),
      },
      "error",
    );
  }

  const github = options.github ?? gitHubActions(config.dispatch);
  try {
    if ((await github.activeRuns()) > 0) {
      return save(
        {
          ...state,
          state: "running",
          message: "Workflow cắt clip đang chạy; bài mới duyệt sẽ vào lượt sau.",
        },
        "running",
      );
    }
    await github.dispatch();
    return save(
      {
        ...state,
        state: "dispatched",
        requestedAt: null,
        dispatchedAt: now.toISOString(),
        message: `Đã gọi workflow cắt clip cho ${due} bài.`,
        retryAt: null,
      },
      "dispatched",
    );
  } catch (error) {
    const message = error instanceof GitHubError ? error.message : "lỗi không rõ khi gọi GitHub";
    return save(
      {
        ...state,
        state: "error",
        message: `Không gọi được workflow cắt clip (${message}). Sẽ thử lại sau 5 phút.`,
        retryAt: new Date(now.getTime() + ERROR_RETRY_MS).toISOString(),
      },
      "error",
    );
  }
}
