import { describe, expect, it } from "vitest";

import { selectUniqueMatch, titleFromFilename } from "./match";

describe("sync matching", () => {
  it("derives a draft title from a primary-host filename", () => {
    expect(titleFromFilename("Morning_Gym.Session.mp4")).toBe(
      "Morning Gym Session",
    );
  });

  it("auto-matches only one exact candidate", () => {
    expect(selectUniqueMatch([{ id: "one" }])).toEqual({ id: "one" });
    expect(selectUniqueMatch([])).toBeNull();
  });

  it("leaves duplicate normalized candidates for manual matching", () => {
    expect(
      selectUniqueMatch([{ id: "one" }, { id: "two" }]),
    ).toBeNull();
  });

  it("uses the same unique-match rule when a new primary host finds an existing video", () => {
    const existingVideos = [{ videoId: "video-1" }];
    expect(selectUniqueMatch(existingVideos)?.videoId).toBe("video-1");

    const ambiguous = [
      { videoId: "video-1" },
      { videoId: "video-2" },
    ];
    expect(selectUniqueMatch(ambiguous)).toBeNull();
  });
});
