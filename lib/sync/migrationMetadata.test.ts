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

  it("parses the real data-repo format: BOM log, CRLF, quoted commas, '; ' tags", async () => {
    // Mirrors ronganminh/stream-video-data: videos.csv has no BOM while
    // migration-log.csv is written by Python with utf-8-sig (BOM) and CRLF.
    writeFixtures(
      [
        "post_id,title,link,thumbnail_url,tags,drive_links",
        "80243,Tus Gunn x Bedao_HaDong07,https://x.invalid/a/,https://img.invalid/a.jpg,Gay video; Vietnam video,https://drive.google.com/file/d/a/view",
        '80244,"Seachan, 6 múi",https://x.invalid/b/,https://img.invalid/b.jpg,"Asia video; Gay video; gay  VIDEO",',
        "",
      ].join("\r\n"),
      "﻿" +
        [
          "post_id,title,earnvids_file_code,dood_file_code,voe_file_code,overall_status",
          "80243,Tus Gunn x Bedao_HaDong07,bg19ggdbx879,07lelepr81h1,dysbwykqqsqf,OK",
          '80244,"Seachan, 6 múi",ev2,dd2,vo2,OK',
          "",
        ].join("\r\n"),
    );

    for (const [hostId, codes] of [
      ["earnvids", ["bg19ggdbx879", "ev2"]],
      ["dood", ["07lelepr81h1", "dd2"]],
      ["voe", ["dysbwykqqsqf", "vo2"]],
    ] as const) {
      const metadata = await loadMigrationMetadata(hostId);
      expect(metadata.tagsByHostCode.get(codes[0])).toEqual([
        "Gay video",
        "Vietnam video",
      ]);
      // Duplicate tags (case/whitespace variants) collapse to one.
      expect(metadata.tagsByHostCode.get(codes[1])).toEqual([
        "Asia video",
        "Gay video",
      ]);
    }
  });

  it("returns empty metadata when no CSV is configured or mounted", async () => {
    delete process.env.MIGRATION_VIDEOS_CSV;
    delete process.env.MIGRATION_LOG_CSV;

    const metadata = await loadMigrationMetadata("earnvids");

    expect(metadata.tagsByHostCode.size).toBe(0);
    expect(metadata.sourceThumbnailByHostCode.size).toBe(0);
  });
});
