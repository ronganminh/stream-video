import { describe, expect, it } from "vitest";

import { categories } from "./fixtures/categories";
import { tags } from "./fixtures/tags";
import { videos } from "./fixtures/videos";
import { formatDuration, formatViews, timeAgo } from "./format";

describe("formatDuration", () => {
  it("formats minute durations", () => {
    expect(formatDuration(724)).toBe("12:04");
    expect(formatDuration(59)).toBe("0:59");
  });

  it("formats hour durations", () => {
    expect(formatDuration(3_753)).toBe("1:02:33");
    expect(formatDuration(7_200)).toBe("2:00:00");
  });

  it("uses the fallback for null or invalid durations", () => {
    expect(formatDuration(null)).toBe("--:--");
    expect(formatDuration(-1)).toBe("--:--");
  });
});

describe("formatViews", () => {
  it("uses the empty state for zero views", () => {
    expect(formatViews(0)).toBe("No views yet");
  });

  it("formats compact counts", () => {
    expect(formatViews(1_200)).toBe("1.2K views");
    expect(formatViews(1_200_000)).toBe("1.2M views");
    expect(formatViews(12_000_000)).toBe("12M views");
  });

  it("keeps small counts readable", () => {
    expect(formatViews(1)).toBe("1 view");
    expect(formatViews(999)).toBe("999 views");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-03T12:00:00.000Z");

  it("returns just now for less than a minute", () => {
    expect(timeAgo("2026-10-03T11:59:30.000Z", now)).toBe("just now");
  });

  it("formats minutes", () => {
    expect(timeAgo("2026-10-03T11:48:00.000Z", now)).toBe("12 min ago");
  });

  it("formats years", () => {
    expect(timeAgo("2023-10-04T12:00:00.000Z", now)).toBe("3 yr ago");
  });
});

describe("T02 fixture coverage", () => {
  it("contains the required fixture volumes", () => {
    expect(videos).toHaveLength(60);
    expect(categories).toHaveLength(24);
    expect(tags).toHaveLength(40);
  });

  it("contains all required video edge cases", () => {
    expect(videos.some((video) => video.title.length === 100)).toBe(true);
    expect(videos.some((video) => video.views === 0)).toBe(true);
    expect(videos.some((video) => video.views === 12_000_000)).toBe(true);
    expect(videos.some((video) => video.durationSeconds === null)).toBe(true);
    expect(videos.some((video) => video.thumbnailUrl === null)).toBe(true);
    expect(videos.some((video) => video.durationSeconds === 59)).toBe(true);
    expect(videos.some((video) => video.durationSeconds === 7_200)).toBe(true);
  });
});
