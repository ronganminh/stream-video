import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

// The Colab notebook's Python (helpers, client) and the GitHub Actions X
// clip maker are tested with unittest; run them here so CI covers them.
// Skipped where python3 or requests is missing.
const dir = path.resolve(__dirname);
const clipsDir = path.resolve(__dirname, "../x-clips");
const python = spawnSync("python3", ["-c", "import requests"]).status === 0;

describe.skipIf(!python)("publish client (Python)", () => {
  it("passes its unittest suite and the notebook is up to date", () => {
    const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", dir, "-p", "test_*.py"], {
      encoding: "utf8",
    });
    expect(result.stderr).toMatch(/\nOK/);
    expect(result.status).toBe(0);
  }, 120_000);

  it("X clip maker passes its unittest suite", () => {
    const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", clipsDir, "-p", "test_*.py"], {
      encoding: "utf8",
    });
    expect(result.stderr).toMatch(/\nOK/);
    expect(result.status).toBe(0);
  }, 120_000);
});
