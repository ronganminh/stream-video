import { runBackfill } from "../lib/sync/backfill";
import { runHealthCheck } from "../lib/sync/healthCheck";
import {
  applyLostDSlugFixes,
  planLostDSlugFixes,
  type FixScope,
} from "../lib/sync/fixLostDSlugs";
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

  if (command === "slugs:fix-d") {
    // Dry run unless --apply. --scope=drafts|published|all (default drafts:
    // the safe batch, no public URLs), --ids=a,b to pick videos.
    const apply = args.includes("--apply");
    const option = (name: string) =>
      args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    const scope = (option("scope") ?? "drafts") as FixScope;
    if (!["drafts", "published", "all"].includes(scope)) {
      console.error(`Unknown --scope=${scope} (drafts|published|all)`);
      return 1;
    }
    const ids = option("ids")?.split(",").filter(Boolean);

    const plan = await planLostDSlugFixes({ scope, ids });
    console.info("id\tredirect\tcurrent slug\tnew slug\ttitle");
    for (const fix of plan) {
      console.info(
        [fix.id, fix.redirect ? "301" : "-", fix.from, fix.to + (fix.suffixed ? " (suffixed)" : ""), fix.title].join("\t"),
      );
    }
    const redirects = plan.filter((fix) => fix.redirect).length;
    if (!apply) {
      console.info(
        `SLUGS FIX-D dry run (scope=${scope}): would rename ${plan.length} videos, ${redirects} with a 301 from the old slug; nothing changed. Re-run with --apply to write.`,
      );
      return 0;
    }

    const { applied, skipped } = await applyLostDSlugFixes(plan);
    for (const { fix, reason } of skipped) console.error(`  skipped ${fix.id} (${fix.from}): ${reason}`);
    console.info(
      `SLUGS FIX-D applied (scope=${scope}): renamed=${applied.length} redirects=${applied.filter((fix) => fix.redirect).length} skipped=${skipped.length}. Cached list pages pick up the new slugs within their revalidate window; old URLs 301 meanwhile.`,
    );
    return skipped.length > 0 ? 1 : 0;
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
    "Usage: tsx worker/cli.ts <sync:new|sync:health|backfill|media:resize [--dry-run]|slugs:lost-d|slugs:fix-d [--scope=drafts|published|all] [--ids=a,b] [--apply]>",
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
