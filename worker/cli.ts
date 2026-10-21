import { runBackfill } from "../lib/sync/backfill";
import { runHealthCheck } from "../lib/sync/healthCheck";
import { findLostDSlugs } from "../lib/sync/lostDSlugs";
import { runNewVideos } from "../lib/sync/newVideos";
import { runMediaResize } from "../lib/sync/resizeMedia";

export async function runCli(args = process.argv.slice(2)): Promise<number> {
  const command = args[0];

  if (command === "backfill") {
    const result = await runBackfill();
    console.info(
      `BACKFILL complete: scanned=${result.scanned} titled=${result.titled} tagged=${result.tagged} thumbnailed=${result.thumbnailed} errors=${result.errors.length}`,
    );
    for (const error of result.errors.slice(0, 10)) {
      console.error(`  ${error}`);
    }
    return result.errors.length > 0 ? 1 : 0;
  }

  if (command === "media:resize") {
    const dryRun = args.includes("--dry-run");
    const result = await runMediaResize({ dryRun });
    console.info(
      `MEDIA RESIZE ${dryRun ? "dry run " : ""}complete: scanned=${result.scanned} resized=${result.resized} versioned=${result.versioned} unchanged=${result.unchanged} errors=${result.errors.length}`,
    );
    for (const error of result.errors.slice(0, 20)) {
      console.error(`  ${error}`);
    }
    return result.errors.length > 0 ? 1 : 0;
  }

  if (command === "slugs:lost-d") {
    // Read-only: lists slugs that dropped đ/Đ. Changes nothing.
    const found = await findLostDSlugs();
    console.info("kind\tpublished\tid\tcurrent slug\tproposed slug\tname");
    for (const row of found) {
      console.info(
        [row.kind, row.published ?? "", row.id, row.slug, row.proposed, row.name].join("\t"),
      );
    }
    const count = (kind: string) => found.filter((row) => row.kind === kind).length;
    const published = found.filter((row) => row.kind === "video" && row.published).length;
    console.info(
      `SLUGS LOST-D dry run: videos=${count("video")} (published=${published}) tags=${count("tag")} categories=${count("category")}; nothing changed`,
    );
    return 0;
  }

  if (command === "sync:new") {
    const result = await runNewVideos();
    console.info(
      result.skipped
        ? "NEW sync skipped: another sync run is active."
        : `NEW sync complete: created=${result.run.created} matched=${result.run.matched}`,
    );
    return result.skipped ? 2 : 0;
  }

  if (command === "sync:health") {
    const result = await runHealthCheck();
    console.info(
      result.skipped
        ? "HEALTH sync skipped: another sync run is active."
        : `HEALTH sync complete: missing=${result.run.missing}`,
    );
    return result.skipped ? 2 : 0;
  }

  console.error(
    "Usage: tsx worker/cli.ts <sync:new|sync:health|backfill|media:resize [--dry-run]|slugs:lost-d>",
  );
  return 1;
}

if (process.env.NODE_ENV !== "test") {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
