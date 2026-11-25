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
  /** How often the worker runs a queue cycle outside the peak window. */
  syncMinutes: number;
  /**
   * The evening window when Buffer posts (local hours [start, end), end may
   * be 24): cycles run every peakMinutes so its 10-post queue never runs dry.
   */
  peakMinutes: number;
  peakStartHour: number;
  peakEndHour: number;
  timeZone: string;
  /**
   * At most one Buffer read (to confirm posts went out, and to see the real
   * queue) per this many minutes; between reads the queue room comes from
   * the due times Buffer gave our posts (SocialPost.bufferDueAt).
   */
  confirmMinutes: number;
  /** Requests to keep in reserve in Buffer's 30-day window. */
  rateReserve: number;
  /** Longest clip, in seconds; 0 = no limit (X Premium: post the full video). */
  clipSeconds: number;
  /** Largest clip upload, in bytes (X accepts up to 512 MB). */
  clipMaxBytes: number;
  /**
   * Longest video the X account accepts (free accounts: ~140 s; raise it
   * after upgrading to Premium). "Keep whole video" is cut to this length.
   */
  maxVideoSeconds: number;
  /**
   * Clips for posts approved in /admin/review are cut by the GitHub Actions
   * workflow .github/workflows/x-clips.yml, started through the GitHub API
   * with a fine-grained token (Actions: write on this repository only).
   */
  dispatch: {
    token: string;
    repository: string;
    workflow: string;
    ref: string;
    /** Wait this long after the last approval, so a burst starts one run. */
    debounceSeconds: number;
  };
};

/** "17-24" → 17:00 to midnight (local). Invalid → the default 17-24. */
export function peakHours(raw: string | undefined): { peakStartHour: number; peakEndHour: number } {
  const match = raw?.trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (match) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start >= 0 && start <= 23 && end >= 1 && end <= 24 && start !== end) return { peakStartHour: start, peakEndHour: end };
  }
  return { peakStartHour: 17, peakEndHour: 24 };
}

function validTimeZone(zone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "Asia/Ho_Chi_Minh";
  }
}

/** The local hour (0-23) of `now` in `timeZone`. */
export function localHour(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number(hour) % 24;
}

/** Minutes between queue cycles at `now`: peakMinutes inside the window, else syncMinutes. */
export function syncIntervalMinutes(
  now: Date,
  config: Pick<SocialConfig, "syncMinutes" | "peakMinutes" | "peakStartHour" | "peakEndHour" | "timeZone">,
): number {
  const hour = localHour(now, config.timeZone);
  const { peakStartHour: start, peakEndHour: end } = config;
  const inside = start < end ? hour >= start && hour < end : hour >= start || hour < end;
  return inside ? config.peakMinutes : config.syncMinutes;
}

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
    peakMinutes: intEnv("BUFFER_SYNC_PEAK_MINUTES", 30, 5, 24 * 60),
    ...peakHours(process.env.BUFFER_PEAK_HOURS),
    timeZone: validTimeZone(process.env.BUFFER_TIMEZONE?.trim() || "Asia/Ho_Chi_Minh"),
    confirmMinutes: intEnv("BUFFER_CONFIRM_MINUTES", 180, 15, 24 * 60),
    rateReserve: intEnv("BUFFER_RATE_RESERVE", 50, 0, 100_000),
    clipSeconds: intEnv("X_CLIP_SECONDS", 120, 0, 4 * 60 * 60),
    clipMaxBytes: intEnv("X_CLIP_MAX_MB", 512, 1, 512) * 1024 * 1024,
    maxVideoSeconds: intEnv("X_MAX_VIDEO_SECONDS", 140, 1, 4 * 60 * 60),
    dispatch: {
      token: process.env.GAYVIDEO_CLIP_DISPATCH?.trim() ?? "",
      repository: process.env.X_CLIPS_REPOSITORY?.trim() || "ronganminh/stream-video",
      workflow: process.env.X_CLIPS_WORKFLOW?.trim() || "x-clips.yml",
      ref: process.env.X_CLIPS_REF?.trim() || "main",
      debounceSeconds: intEnv("X_CLIPS_DEBOUNCE_SECONDS", 90, 0, 3600),
    },
  };
}
