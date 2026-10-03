import type { HostFileDTO, HostProvider } from "./types";

const API_BASE = "https://voe.sx/api";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_MIN_INTERVAL_MS = 300;

type FetchLike = typeof fetch;
type Sleep = (milliseconds: number) => Promise<void>;

type ProviderOptions = {
  apiKey?: string;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
  timeoutMs?: number;
  retryBaseMs?: number;
  minIntervalMs?: number;
};

type VoeListFile = {
  filecode?: string;
  name?: string;
  title?: string;
  uploaded?: string;
};

type VoeListResponse = {
  status?: number;
  success?: boolean;
  message?: string;
  result?: {
    current_page?: number;
    last_page?: number;
    next_page_url?: string | null;
    data?: VoeListFile[];
  };
};

type VoeInfoFile = {
  status?: number;
  fileCode?: string;
  name?: string;
  title?: string;
  length?: string | number;
};

type VoeInfoResponse = {
  status?: number;
  success?: boolean;
  message?: string;
  result?: VoeInfoFile[];
};

function numberOrNull(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uploadedAtOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value.replace(" ", "T") + "Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function listToDto(file: VoeListFile): HostFileDTO | null {
  if (!file.filecode) return null;

  return {
    code: file.filecode,
    title: file.title ?? file.name ?? file.filecode,
    lengthSeconds: null,
    thumbnailUrl: null,
    uploadedAt: uploadedAtOrNull(file.uploaded),
  };
}

function infoToDto(file: VoeInfoFile): HostFileDTO | null {
  if (!file.fileCode) return null;

  return {
    code: file.fileCode,
    title: file.title ?? file.name ?? file.fileCode,
    lengthSeconds: numberOrNull(file.length),
    thumbnailUrl: null,
    uploadedAt: null,
  };
}

const defaultSleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createVoeProvider(
  options: ProviderOptions = {},
): HostProvider {
  const apiKey = options.apiKey ?? process.env.HOST_VOE_API_KEY ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  const minIntervalMs =
    options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  let lastStartedAt = 0;

  const request = async <T>(path: string, params: Record<string, string>) => {
    if (!apiKey) {
      throw new Error("HOST_VOE_API_KEY is required");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const waitMs = Math.max(0, lastStartedAt + minIntervalMs - Date.now());
      if (waitMs > 0) await sleep(waitMs);
      lastStartedAt = Date.now();

      const url = new URL(`${API_BASE}${path}`);
      url.searchParams.set("key", apiKey);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(url, { signal: controller.signal });
        if (response.ok) {
          return (await response.json()) as T;
        }

        if (response.status !== 429 && response.status < 500) {
          throw new Error(`VOE API returned HTTP ${response.status}`);
        }
      } catch (error) {
        if (attempt === 2) throw error;
      } finally {
        clearTimeout(timer);
      }

      if (attempt < 2) {
        await sleep(retryBaseMs * 2 ** attempt);
      }
    }

    throw new Error("VOE API request failed");
  };

  return {
    id: "voe",
    label: "VOE",
    embedDomains: ["voe.sx"],

    async listFiles({ page, perPage }) {
      const response = await request<VoeListResponse>("/file/list", {
        page: String(page),
        per_page: String(perPage),
      });

      if (response.status !== 200 || response.success === false || !response.result) {
        throw new Error(response.message ?? "VOE listFiles failed");
      }

      const files = (response.result.data ?? [])
        .map(listToDto)
        .filter((file): file is HostFileDTO => file !== null);
      const currentPage = response.result.current_page ?? page;
      const lastPage = response.result.last_page ?? currentPage;

      return {
        files,
        hasMore:
          response.result.next_page_url !== null &&
          currentPage < lastPage,
      };
    },

    async getFileInfo(code) {
      const response = await request<VoeInfoResponse>("/file/info", {
        file_code: code,
      });

      if (response.status === 404) return null;
      if (response.status !== 200 || response.success === false) {
        throw new Error(response.message ?? "VOE getFileInfo failed");
      }

      const file = response.result?.find(
        (item) => item.fileCode === code && item.status !== 404,
      );
      return file ? infoToDto(file) : null;
    },

    embedUrl(code) {
      return `https://voe.sx/e/${encodeURIComponent(code)}`;
    },
  };
}

export const voeProvider = createVoeProvider();
