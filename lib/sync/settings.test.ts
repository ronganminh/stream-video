import { describe, expect, it } from "vitest";

import {
  DEFAULT_SYNC_SETTINGS,
  parseSyncSettings,
  SYNC_SETTING_KEYS,
} from "./settings";

describe("sync settings", () => {
  it("uses documented defaults for missing or invalid values", () => {
    expect(parseSyncSettings({})).toEqual(DEFAULT_SYNC_SETTINGS);
    expect(
      parseSyncSettings({
        [SYNC_SETTING_KEYS.newIntervalMinutes]: 0,
        [SYNC_SETTING_KEYS.healthIntervalHours]: "24",
        [SYNC_SETTING_KEYS.autoMatchEnabled]: "false",
      }),
    ).toEqual(DEFAULT_SYNC_SETTINGS);
  });

  it("reads the shared T16 setting keys", () => {
    expect(
      parseSyncSettings({
        [SYNC_SETTING_KEYS.newIntervalMinutes]: 5,
        [SYNC_SETTING_KEYS.healthIntervalHours]: 12,
        [SYNC_SETTING_KEYS.autoMatchEnabled]: false,
      }),
    ).toEqual({
      newIntervalMinutes: 5,
      healthIntervalHours: 12,
      autoMatchEnabled: false,
    });
  });
});
