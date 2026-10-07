import { runBackfill } from "../lib/sync/backfill";
import { runHealthCheck } from "../lib/sync/healthCheck";
import { runNewVideos } from "../lib/sync/newVideos";

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

  console.error("Usage: tsx worker/cli.ts <sync:new|sync:health|backfill>");
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
