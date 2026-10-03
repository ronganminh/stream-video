type Entry = {
  attempts: number[];
};

const entries = new Map<string, Entry>();

export type LoginRateLimitOptions = {
  maxAttempts?: number;
  windowMs?: number;
  now?: number;
};

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1_000;

export function checkLoginRateLimit(
  key: string,
  options: LoginRateLimitOptions = {},
): { allowed: boolean; retryAfterSeconds: number } {
  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const entry = entries.get(key) ?? { attempts: [] };
  const recent = entry.attempts.filter((at) => now - at < windowMs);

  if (recent.length >= maxAttempts) {
    const oldest = recent[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowMs - (now - oldest)) / 1_000),
      ),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordLoginFailure(
  key: string,
  now = Date.now(),
): void {
  const entry = entries.get(key) ?? { attempts: [] };
  entry.attempts.push(now);
  entries.set(key, entry);
}

export function clearLoginFailures(key: string): void {
  entries.delete(key);
}
