// Settings for posting to X through Buffer, all from the environment. None
// is a secret except BUFFER_API_KEY, which is never logged.

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export type SocialConfig = {
  /** Buffer is configured: without a key nothing is pushed (posts stay queued). */
  enabled: boolean;
  apiKey: string;
  /** Optional; found by handle and remembered when unset. */
  channelId: string | null;
  organizationId: string | null;
  /** The X account to post as, without "@". */
  xHandle: string;
  /** Buffer Free keeps at most 10 scheduled posts per channel. */
  queueLimit: number;
  /** How often the worker talks to Buffer when there is work. */
  syncMinutes: number;
  /** Requests to keep in reserve in Buffer's 30-day window. */
  rateReserve: number;
  /** Longest clip, in seconds; 0 = no limit (X Premium: post the full video). */
  clipSeconds: number;
  /** Largest clip upload, in bytes (X accepts up to 512 MB). */
  clipMaxBytes: number;
};

export function socialConfig(): SocialConfig {
  const apiKey = process.env.BUFFER_API_KEY?.trim() ?? "";
  return {
    enabled: apiKey.length > 0,
    apiKey,
    channelId: process.env.BUFFER_X_CHANNEL_ID?.trim() || null,
    organizationId: process.env.BUFFER_ORGANIZATION_ID?.trim() || null,
    xHandle: (process.env.BUFFER_X_HANDLE?.trim() || "Gayvideofun").replace(/^@/, ""),
    queueLimit: intEnv("BUFFER_QUEUE_LIMIT", 10, 1, 2000),
    syncMinutes: intEnv("BUFFER_SYNC_MINUTES", 120, 5, 24 * 60),
    rateReserve: intEnv("BUFFER_RATE_RESERVE", 50, 0, 100_000),
    clipSeconds: intEnv("X_CLIP_SECONDS", 120, 0, 4 * 60 * 60),
    clipMaxBytes: intEnv("X_CLIP_MAX_MB", 512, 1, 512) * 1024 * 1024,
  };
}
