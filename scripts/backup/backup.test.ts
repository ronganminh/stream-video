import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPTS = resolve(__dirname);

function run(command: string, args: string[], options: SpawnSyncOptions = {}) {
  const result = spawnSync(command, args, options);
  return {
    status: result.status,
    stdout: Buffer.from(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

const has = (tool: string) => run("sh", ["-c", `command -v ${tool}`]).status === 0;

describe("retention.sh", () => {
  const retention = (keep: string, names: string[]) =>
    run("bash", [join(SCRIPTS, "retention.sh"), keep], { input: names.join("\n") + "\n" });
  const backup = (stamp: string) => [
    `gayvideo-backup-${stamp}.tar.age`,
    `gayvideo-backup-${stamp}.tar.age.sha256`,
  ];

  it("lists everything but the newest backups, with their checksum files", () => {
    const names = [
      ...backup("20260101T000000Z"),
      ...backup("20260108T000000Z"),
      ...backup("20260115T000000Z"),
      "README.md",
    ];
    const result = retention("2", names);
    expect(result.status).toBe(0);
    expect(result.stdout.toString().trim().split("\n")).toEqual(backup("20260101T000000Z"));
  });

  it("never lists files the workflow did not create", () => {
    const names = [
      "README.md",
      "notes.txt",
      "gayvideo-backup-2026.tar.age",
      "gayvideo-backup-20250101T000000Z.tar.age copy",
      "old-gayvideo-backup-20250101T000000Z.tar.age",
      ...backup("20260101T000000Z"),
    ];
    expect(retention("1", names).stdout.toString()).toBe("");
  });

  it("does nothing when there are fewer backups than kept", () => {
    expect(retention("8", backup("20260101T000000Z")).stdout.toString()).toBe("");
  });

  it("rejects a bad keep count", () => {
    expect(retention("0", []).status).not.toBe(0);
    expect(retention("abc", []).status).not.toBe(0);
  });
});

describe("vps-keep.sh", () => {
  it("moves the uploads into the backup dir and keeps only the newest backups", () => {
    const home = mkdtempSync(join(tmpdir(), "gv-vps-"));
    const dir = join(home, "weekly");
    try {
      mkdirSync(dir);
      for (const stamp of ["20260101T000000Z", "20260108T000000Z"]) {
        writeFileSync(join(dir, `gayvideo-backup-${stamp}.tar.age`), "old");
        writeFileSync(join(dir, `gayvideo-backup-${stamp}.tar.age.sha256`), "old");
      }
      writeFileSync(join(dir, "keep-me.txt"), "not a backup");
      const fresh = "gayvideo-backup-20260115T000000Z.tar.age";
      writeFileSync(join(home, `${fresh}.upload`), "new");
      writeFileSync(join(home, `${fresh}.sha256.upload`), "new");

      const script = Buffer.concat([
        readFileSync(join(SCRIPTS, "retention-lib.sh")),
        readFileSync(join(SCRIPTS, "vps-keep.sh")),
      ]);
      const result = run("bash", ["-s", "--", dir, "2", fresh, `${fresh}.sha256`], {
        input: script,
        env: { ...process.env, HOME: home },
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(run("ls", ["-1", dir]).stdout.toString().trim().split("\n")).toEqual([
        "gayvideo-backup-20260108T000000Z.tar.age",
        "gayvideo-backup-20260108T000000Z.tar.age.sha256",
        "gayvideo-backup-20260115T000000Z.tar.age",
        "gayvideo-backup-20260115T000000Z.tar.age.sha256",
        "keep-me.txt",
      ]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses names it did not expect", () => {
    const home = mkdtempSync(join(tmpdir(), "gv-vps-"));
    try {
      const script = Buffer.concat([
        readFileSync(join(SCRIPTS, "retention-lib.sh")),
        readFileSync(join(SCRIPTS, "vps-keep.sh")),
      ]);
      const result = run("bash", ["-s", "--", join(home, "weekly"), "7", "../../etc/passwd"], {
        input: script,
        env: { ...process.env, HOME: home },
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("refusing unexpected name");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// The whole chain on real tools: remote-backup.sh (with a docker stub that
// dumps the local test database) -> age -> verify-backup.sh (pg_restore into a
// fresh database). Skipped where the tools or a database are missing.
const databaseUrl = process.env.DATABASE_URL?.replace(/\?.*$/, "");
const canRunChain =
  Boolean(databaseUrl) && ["age", "age-keygen", "pg_dump", "pg_restore", "psql", "jq"].every(has);

describe.skipIf(!canRunChain)("backup chain", () => {
  const STAMP = "20261025T191700Z";
  let dir: string;
  let verifyDb: string;
  let verifyUrl: string;
  let encrypted: string;
  let identity: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "gv-backup-"));

    // A deployed checkout: git commit, .env, media files.
    const app = join(dir, "app");
    mkdirSync(join(dir, "media-root", "media", "sub"), { recursive: true });
    writeFileSync(join(dir, "media-root", "media", "a.webp"), "thumb a");
    writeFileSync(join(dir, "media-root", "media", "sub", "b.webp"), "thumb b");
    mkdirSync(app);
    writeFileSync(join(app, ".env"), "DATABASE_URL=postgresql://secret@postgres/x\nOTHER=1\n");
    for (const args of [
      ["init", "-q"],
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x"],
    ]) {
      expect(run("git", args, { cwd: app }).status).toBe(0);
    }

    // docker stub: `docker compose exec -T <service> ...` against local tools.
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "docker"),
      `#!/usr/bin/env bash
set -euo pipefail
[ "$1" = info ] && exit 0
[ "$1 $2 $3" = "compose exec -T" ] || { echo "unexpected docker $*" >&2; exit 1; }
service="$4"; shift 4
case "$service" in
  postgres)
    if [[ "$3" == *pg_dump* ]]; then exec pg_dump --format=custom "$STUB_DB_URL"; fi
    exec psql "$STUB_DB_URL" -Atc "$5" ;;
  worker) exec tar -C "$STUB_MEDIA_ROOT" -cf - media ;;
esac
exit 1
`,
    );
    chmodSync(join(bin, "docker"), 0o755);

    const bundle = run("bash", ["-s", "--", STAMP], {
      input: readFileSync(join(SCRIPTS, "remote-backup.sh")),
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        APP_DIR: app,
        STUB_DB_URL: databaseUrl,
        STUB_MEDIA_ROOT: join(dir, "media-root"),
      },
    });
    expect(bundle.stderr).toContain("Bundle ready");
    expect(bundle.status).toBe(0);
    writeFileSync(join(dir, "bundle.tar"), bundle.stdout);

    identity = join(dir, "key.txt");
    expect(run("age-keygen", ["-o", identity]).status).toBe(0);
    const recipient = run("age-keygen", ["-y", identity]).stdout.toString().trim();
    encrypted = join(dir, `gayvideo-backup-${STAMP}.tar.age`);
    expect(run("age", ["-r", recipient, "-o", encrypted, join(dir, "bundle.tar")]).status).toBe(0);

    verifyDb = `gv_verify_${process.pid}`;
    expect(run("psql", [databaseUrl!, "-c", `CREATE DATABASE ${verifyDb}`]).status).toBe(0);
    verifyUrl = databaseUrl!.replace(/\/[^/]+$/, `/${verifyDb}`);
  });

  afterAll(() => {
    if (verifyDb) run("psql", [databaseUrl!, "-c", `DROP DATABASE IF EXISTS ${verifyDb}`]);
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("writes only the tar on stdout, with a manifest matching the database", () => {
    const listing = run("tar", ["-tf", join(dir, "bundle.tar")]).stdout.toString().trim().split("\n");
    expect(listing).toEqual(["manifest.json", "SHA256SUMS", "database.dump", "media.tar", "env"]);

    const manifest = JSON.parse(
      run("tar", ["-xOf", join(dir, "bundle.tar"), "manifest.json"]).stdout.toString(),
    );
    const videos = run("psql", [databaseUrl!, "-Atc", 'SELECT count(*) FROM "Video"']).stdout;
    expect(manifest).toMatchObject({
      format: 1,
      stamp: STAMP,
      videos: Number(videos.toString()),
      media_files: 2,
    });
    expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.files.map((file: { name: string }) => file.name)).toEqual([
      "database.dump",
      "media.tar",
      "env",
    ]);
  });

  it("verify-backup.sh decrypts, checks sha256 and restores the database", () => {
    const result = run("bash", [join(SCRIPTS, "verify-backup.sh"), encrypted, identity], {
      env: { ...process.env, VERIFY_PG_URL: verifyUrl },
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout.toString()).toMatch(/BACKUP OK: 20261025T191700Z, commit [0-9a-f]{7}/);
    // The .env contents never reach the output.
    expect(result.stdout.toString()).not.toContain("secret");
  });

  it("fails on a damaged backup", () => {
    const damaged = join(dir, "damaged.tar.age");
    const bytes = readFileSync(encrypted);
    bytes[bytes.length - 100] ^= 0xff;
    writeFileSync(damaged, bytes);
    const result = run("bash", [join(SCRIPTS, "verify-backup.sh"), damaged, identity], {
      env: { ...process.env, VERIFY_PG_URL: verifyUrl },
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout.toString()).not.toContain("BACKUP OK");
  });

  it("fails when the remote side cannot dump the database", () => {
    const result = run("bash", ["-s", "--", STAMP], {
      input: readFileSync(join(SCRIPTS, "remote-backup.sh")),
      env: {
        ...process.env,
        PATH: `${join(dir, "bin")}:${process.env.PATH}`,
        APP_DIR: join(dir, "app"),
        STUB_DB_URL: "postgresql://nobody@127.0.0.1:1/none",
        STUB_MEDIA_ROOT: join(dir, "media-root"),
      },
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout.length).toBe(0);
  });
});
