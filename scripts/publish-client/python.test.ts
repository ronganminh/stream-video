import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

// The Colab notebook's Python (helpers, client) is tested with unittest;
// run it here so CI covers it. Skipped where python3 or requests is missing.
const dir = path.resolve(__dirname);
const python = spawnSync("python3", ["-c", "import requests"]).status === 0;

describe.skipIf(!python)("publish client (Python)", () => {
  it("passes its unittest suite and the notebook is up to date", () => {
    const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", dir, "-p", "test_*.py"], {
      encoding: "utf8",
    });
    expect(result.stderr).toMatch(/\nOK/);
    expect(result.status).toBe(0);
  }, 120_000);
});
