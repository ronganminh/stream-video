import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadMigrationMetadata } from "./migrationMetadata";

const created: string[] = [];
const savedEnv = {
  videos: process.env.MIGRATION_VIDEOS_CSV,
  log: process.env.MIGRATION_LOG_CSV,
};

function writeFixtures(videos: string, log: string): void {
  const dir = mkdtempSync(join(tmpdir(), "migration-meta-"));
  created.push(dir);
  const videosPath = join(dir, "videos.csv");
  const logPath = join(dir, "migration-log.csv");
  writeFileSync(videosPath, videos, "utf8");
  writeFileSync(logPath, log, "utf8");
  process.env.MIGRATION_VIDEOS_CSV = videosPath;
  process.env.MIGRATION_LOG_CSV = logPath;
}

afterEach(() => {
  process.env.MIGRATION_VIDEOS_CSV = savedEnv.videos;
  process.env.MIGRATION_LOG_CSV = savedEnv.log;
  delete process.env.MIGRATION_VIDEOS_CSV;
  delete process.env.MIGRATION_LOG_CSV;
  while (created.length) {
    rmSync(created.pop() as string, { recursive: true, force: true });
  }
});

describe("loadMigrationMetadata", () => {
  it("maps tags and source thumbnails by the primary host file code", async () => {
    writeFixtures(
      [
        "post_id,title,thumbnail_url,tags",
        'p1,A,https://img.invalid/1.jpg,"tag one; tag two"',
        "p2,B,not-a-url,solo",
        "p3,C,https://img.invalid/3.jpg,",
        "",
      ].join("\n"),
      [
        "post_id,earnvids_file_code",
        "p1,codeA",
        "p2,codeB",
        "p3,codeC",
        "",
      ].join("\n"),
    );

    const metadata = await loadMigrationMetadata("earnvids");

    expect(metadata.tagsByHostCode.get("codeA")).toEqual([
      "tag one",
      "tag two",
    ]);
    expect(metadata.tagsByHostCode.get("codeB")).toEqual(["solo"]);
    expect(metadata.tagsByHostCode.has("codeC")).toBe(false);

    expect(metadata.sourceThumbnailByHostCode.get("codeA")).toBe(
      "https://img.invalid/1.jpg",
    );
    expect(metadata.sourceThumbnailByHostCode.get("codeC")).toBe(
      "https://img.invalid/3.jpg",
    );
    // Non-http(s) values are ignored.
    expect(metadata.sourceThumbnailByHostCode.has("codeB")).toBe(false);
  });

  it("returns empty metadata when no CSV is configured or mounted", async () => {
    delete process.env.MIGRATION_VIDEOS_CSV;
    delete process.env.MIGRATION_LOG_CSV;

    const metadata = await loadMigrationMetadata("earnvids");

    expect(metadata.tagsByHostCode.size).toBe(0);
    expect(metadata.sourceThumbnailByHostCode.size).toBe(0);
  });
});
