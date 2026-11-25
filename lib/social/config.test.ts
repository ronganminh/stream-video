import { describe, expect, it } from "vitest";

import { localHour, peakHours, syncIntervalMinutes } from "./config";

const config = { syncMinutes: 120, peakMinutes: 30, peakStartHour: 17, peakEndHour: 24, timeZone: "Asia/Ho_Chi_Minh" };

describe("Buffer cadence", () => {
  it("runs every 30 minutes from 17:00 to midnight Hanoi time, else every 120", () => {
    expect(localHour(new Date("2026-11-26T10:00:00Z"), "Asia/Ho_Chi_Minh")).toBe(17);
    expect(syncIntervalMinutes(new Date("2026-11-26T09:59:00Z"), config)).toBe(120); // 16:59
    expect(syncIntervalMinutes(new Date("2026-11-26T10:00:00Z"), config)).toBe(30); // 17:00
    expect(syncIntervalMinutes(new Date("2026-11-26T16:59:00Z"), config)).toBe(30); // 23:59
    expect(syncIntervalMinutes(new Date("2026-11-26T17:00:00Z"), config)).toBe(120); // 00:00
    expect(syncIntervalMinutes(new Date("2026-11-26T05:00:00Z"), config)).toBe(120); // 12:00
  });

  it("supports a window across midnight and rejects bad input", () => {
    const night = { ...config, peakStartHour: 22, peakEndHour: 2 };
    expect(syncIntervalMinutes(new Date("2026-11-26T18:00:00Z"), night)).toBe(30); // 01:00
    expect(syncIntervalMinutes(new Date("2026-11-26T20:00:00Z"), night)).toBe(120); // 03:00
    expect(peakHours("18-23")).toEqual({ peakStartHour: 18, peakEndHour: 23 });
    expect(peakHours("25-3")).toEqual({ peakStartHour: 17, peakEndHour: 24 });
    expect(peakHours(undefined)).toEqual({ peakStartHour: 17, peakEndHour: 24 });
  });
});
