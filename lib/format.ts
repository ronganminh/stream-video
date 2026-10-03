const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return "--:--";
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function compact(value: number, divisor: number, suffix: string): string {
  const scaled = value / divisor;
  const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return `${rounded}${suffix}`;
}

export function formatViews(views: number): string {
  const safeViews = Math.max(0, Math.floor(Number.isFinite(views) ? views : 0));

  if (safeViews === 0) {
    return "No views yet";
  }

  if (safeViews >= 1_000_000_000) {
    return `${compact(safeViews, 1_000_000_000, "B")} views`;
  }

  if (safeViews >= 1_000_000) {
    return `${compact(safeViews, 1_000_000, "M")} views`;
  }

  if (safeViews >= 1_000) {
    return `${compact(safeViews, 1_000, "K")} views`;
  }

  return `${safeViews.toLocaleString("en-US")} ${safeViews === 1 ? "view" : "views"}`;
}

export function timeAgo(isoDate: string, now: Date = new Date()): string {
  const published = new Date(isoDate);
  const diff = now.getTime() - published.getTime();

  if (!Number.isFinite(published.getTime()) || diff < MINUTE) {
    return "just now";
  }

  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)} min ago`;
  }

  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)} hr ago`;
  }

  if (diff < WEEK) {
    return `${Math.floor(diff / DAY)} day ago`;
  }

  if (diff < MONTH) {
    return `${Math.floor(diff / WEEK)} wk ago`;
  }

  if (diff < YEAR) {
    return `${Math.floor(diff / MONTH)} mo ago`;
  }

  return `${Math.floor(diff / YEAR)} yr ago`;
}
