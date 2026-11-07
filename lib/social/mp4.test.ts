import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { readMp4Info } from "./mp4";

const dir = mkdtempSync(join(tmpdir(), "gv-mp4-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe("readMp4Info", () => {
  it("rejects files that are not MP4", async () => {
    const path = join(dir, "fake.mp4");
    writeFileSync(path, "<html>not a video</html>");
    expect(await readMp4Info(path)).toBeNull();
  });

  it.skipIf(!hasFfmpeg)("reads the duration of a real MP4 (faststart or not)", async () => {
    for (const faststart of [true, false]) {
      const path = join(dir, `clip-${faststart}.mp4`);
      const result = spawnSync("ffmpeg", [
        "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=3.5",
        "-f", "lavfi", "-i", "sine=duration=3.5",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
        ...(faststart ? ["-movflags", "+faststart"] : []),
        "-y", path,
      ]);
      expect(result.status).toBe(0);
      const info = await readMp4Info(path);
      expect(info?.durationSeconds).toBeGreaterThan(3.4);
      expect(info?.durationSeconds).toBeLessThan(3.7);
    }
  });
});
