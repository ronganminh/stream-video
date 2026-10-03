import { describe, expect, it } from "vitest";

import { normalize } from "./normalize";

describe("normalize", () => {
  it("strips the final extension and lowercases", () => {
    expect(normalize("Morning.Gym.Session.MP4")).toBe("morning gym session");
  });

  it("removes diacritics before collapsing punctuation", () => {
    expect(normalize("Café déjà-vu_Été.mkv")).toBe("cafe deja vu ete");
  });

  it("collapses non-alphanumeric runs and trims", () => {
    expect(normalize("  Road___Trip -- 2026!!.webm  ")).toBe("road trip 2026");
  });

  it("does not remove dots that are part of the filename before the extension", () => {
    expect(normalize("part.one.final.mp4")).toBe("part one final");
  });
});
