import type { HostFileDTO, HostProvider } from "./types";

const API_BASE = "https://doodapi.co/api";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_MIN_INTERVAL_MS = 100;
const DEFAULT_EMBED_BASE = "https://playmogo.com";
const KNOWN_EMBED_DOMAINS = [
  "playmogo.com",
  "myvidplay.com",
  "doodstream.com",
  "dood.pm",
  "dood.watch",
  "dood.so",
  "dood.to",
  "dood.la",
] as const;

type FetchLike = typeof fetch;
type Sleep = (milliseconds: number) => Promise<void>;

type ProviderOptions = {
  apiKey?: string;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
  timeoutMs?: number;
  retryBaseMs?: number;
  minIntervalMs?: number;
  embedBaseUrl?: string;
};

type DoodListFile = {
  file_code?: string;
  title?: string;
  length?: string | number;
  single_img?: string;
  uploaded?: string;
  download_url?: string;
};

type DoodListResponse = {
  status?: number;
  msg?: string;
  result?: {
    total_pages?: number;
    files?: DoodListFile[];
  };
};

type DoodInfoFile = {
  status?: number;
  filecode?: string;
  title?: string;
  length?: string | number;
  single_img?: string;
  uploaded?: string;
  protected_embed?: string;
};

type DoodInfoResponse = {
  status?: number;
  msg?: string;
  result?: DoodInfoFile[];
};

function numberOrNull(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEmbedBase(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("DoodStream embed base must use https.");
  }
  return url.origin;
}

function uploadedAtOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value.replace(" ", "T") + "Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function listToDto(file: DoodListFile): HostFileDTO | null {
  if (!file.file_code) return null;

  return {
    code: file.file_code,
    title: file.title ?? file.file_code,
    lengthSeconds: numberOrNull(file.length),
    thumbnailUrl: file.single_img ?? null,
    uploadedAt: uploadedAtOrNull(file.uploaded),
  };
}

function infoToDto(file: DoodInfoFile): HostFileDTO | null {
  if (!file.filecode) return null;

  return {
    code: file.filecode,
    title: file.title ?? file.filecode,
    lengthSeconds: numberOrNull(file.length),
    thumbnailUrl: file.single_img ?? null,
    uploadedAt: uploadedAtOrNull(file.uploaded),
  };
}

const defaultSleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createDoodProvider(
  options: ProviderOptions = {},
): HostProvider {
  const apiKey = options.apiKey ?? process.env.HOST_DOOD_API_KEY ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  const minIntervalMs =
    options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const configuredEmbedBase =
    options.embedBaseUrl ?? process.env.HOST_DOOD_EMBED_BASE;
  let embedBase = normalizeEmbedBase(
    configuredEmbedBase ?? DEFAULT_EMBED_BASE,
  );
  const embedDomains = Array.from(
    new Set([
      new URL(embedBase).hostname,
      ...KNOWN_EMBED_DOMAINS,
    ]),
  );
  const protectedEmbedPaths = new Map<string, string>();
  const autoDetectEmbedBase = !configuredEmbedBase;
  let lastStartedAt = 0;

  const observeEmbedOrigin = (value: string | undefined): boolean => {
    if (!value || !autoDetectEmbedBase) return false;

    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return false;

      embedBase = url.origin;
      if (!embedDomains.includes(url.hostname)) {
        embedDomains.push(url.hostname);
      }
      return true;
    } catch {
      return false;
    }
  };

  const rememberProtectedEmbed = (
    code: string,
    value: string | undefined,
  ): void => {
    if (!value) return;

    try {
      const absolute = new URL(value, embedBase);
      if (absolute.protocol !== "https:") return;

      if (/^https:\/\//i.test(value)) {
        observeEmbedOrigin(value);
      }
      protectedEmbedPaths.set(
        code,
        `${absolute.pathname}${absolute.search}${absolute.hash}`,
      );
    } catch {
      // Ignore malformed optional embed metadata and use the standard path.
    }
  };

  const request = async <T>(path: string, params: Record<string, string>) => {
    if (!apiKey) {
      throw new Error("HOST_DOOD_API_KEY is required");
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
          throw new Error(`DoodStream API returned HTTP ${response.status}`);
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

    throw new Error("DoodStream API request failed");
  };

  return {
    id: "dood",
    label: "DoodStream",
    embedDomains,

    async listFiles({ page, perPage }) {
      const response = await request<DoodListResponse>("/file/list", {
        page: String(page),
        per_page: String(Math.min(perPage, 200)),
      });

      if (response.status !== 200 || !response.result) {
        throw new Error(response.msg ?? "DoodStream listFiles failed");
      }

      const sourceFiles = response.result.files ?? [];
      for (const file of sourceFiles) {
        if (observeEmbedOrigin(file.download_url)) break;
      }

      const files = sourceFiles
        .map(listToDto)
        .filter((file): file is HostFileDTO => file !== null);

      return {
        files,
        hasMore: page < (response.result.total_pages ?? page),
      };
    },

    async getFileInfo(code) {
      const response = await request<DoodInfoResponse>("/file/info", {
        file_code: code,
      });

      if (response.status === 404) return null;
      if (response.status !== 200) {
        throw new Error(response.msg ?? "DoodStream getFileInfo failed");
      }

      const file = response.result?.find(
        (item) => item.filecode === code && item.status !== 404,
      );
      if (!file) return null;

      rememberProtectedEmbed(code, file.protected_embed);
      return infoToDto(file);
    },

    embedUrl(code) {
      const protectedPath = protectedEmbedPaths.get(code);
      if (protectedPath) {
        return new URL(protectedPath, embedBase).toString();
      }
      return `${embedBase}/e/${encodeURIComponent(code)}`;
    },
  };
}

export const doodProvider = createDoodProvider();
