import { runBackfill } from "../lib/sync/backfill";
import { prisma } from "../lib/db";
import { bufferClient } from "../lib/social/buffer";
import { upgradeLegacyCaptions } from "../lib/social/captionUpgrade";
import { socialConfig } from "../lib/social/config";
import { runSocialSync, X_NETWORK } from "../lib/social/queue";
import { runHealthCheck } from "../lib/sync/healthCheck";
import {
  applyLostDSlugFixes,
  planLostDSlugFixes,
  type FixScope,
} from "../lib/sync/fixLostDSlugs";
import { findLostDSlugs } from "../lib/sync/lostDSlugs";
import { runNewVideos } from "../lib/sync/newVideos";
import { runMediaResize } from "../lib/sync/resizeMedia";
import { applyHealthRestore, planHealthRestore } from "../lib/sync/restoreHealthRemoved";
import { cspSelfTest, listCspReports, newPlayerDomains } from "../lib/security/cspReports";

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

  if (command === "social:caption-upgrade") {
    // Run by every deploy. Moves the saved X caption template and unedited
    // captions of posts not yet in Buffer from "New video: {title} 🔥" to the
    // title alone. --dry-run changes nothing. Prints counts only.
    const result = await upgradeLegacyCaptions({ apply: !args.includes("--dry-run") });
    const settingText = {
      upgraded: "old default -> {title}",
      custom: "custom template kept",
      default: "already {title}",
      unset: "not saved (code default {title})",
    }[result.setting];
    console.info(
      `X CAPTIONS${args.includes("--dry-run") ? " (dry run)" : ""}: setting=${settingText}; posts updated=${result.posts} of ${result.checked} not yet in Buffer`,
    );
    return 0;
  }

  if (command === "social:status") {
    // The X queue, newest first. Read-only; no Buffer call.
    const rows = await prisma.socialPost.findMany({
      where: { network: X_NETWORK },
      include: { video: { select: { slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    for (const row of rows) {
      console.info(
        [row.status, row.video.slug, row.externalLink ?? "", row.lastError ?? ""].filter(Boolean).join("\t"),
      );
    }
    const counts = await prisma.socialPost.groupBy({ by: ["status"], _count: true });
    console.info(`X queue: ${counts.map((c) => `${c.status}=${c._count}`).join(" ") || "empty"}; Buffer ${socialConfig().enabled ? "configured" : "NOT configured (BUFFER_API_KEY)"}`);
    return 0;
  }

  if (command === "social:sync") {
    // One cycle now, ignoring BUFFER_SYNC_MINUTES.
    const summary = await runSocialSync();
    console.info(`X queue: ${JSON.stringify(summary)}`);
    return 0;
  }

  if (command === "social:channels") {
    // Which X channel of the Buffer account the queue posts to.
    const config = socialConfig();
    if (!config.enabled) {
      console.error("BUFFER_API_KEY is not set");
      return 1;
    }
    const channel = await bufferClient(config.apiKey).findXChannel(config.xHandle);
    console.info(`@${config.xHandle}: channelId=${channel.channelId} organizationId=${channel.organizationId}`);
    return 0;
  }

  if (command === "social:retry" || command === "social:cancel") {
    const slug = args[1];
    if (!slug) {
      console.error(`Usage: ${command} <video slug>`);
      return 1;
    }
    const retry = command === "social:retry";
    const result = await prisma.socialPost.updateMany({
      where: {
        network: X_NETWORK,
        video: { slug },
        status: { in: retry ? ["failed", "cancelled"] : ["waiting", "queued", "failed"] },
      },
      data: retry
        ? { status: "queued", attempts: 0, lastError: null, nextAttemptAt: null }
        : { status: "cancelled", lastError: "Cancelled by an admin" },
    });
    console.info(result.count ? `${retry ? "Requeued" : "Cancelled"} the X post of ${slug}` : `Nothing to ${retry ? "retry" : "cancel"} for ${slug}`);
    return result.count ? 0 : 1;
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

  if (command === "videos:restore-health") {
    // Dry run unless --apply. Lists every REMOVED video the health check (or
    // an unknown cause) removed, checks its files on the hosts, and restores
    // only those with a live file and nothing suggesting a deliberate removal.
    // --no-host-check skips the live check (DB mirror status only).
    const apply = args.includes("--apply");
    const rows = await planHealthRestore({ checkHosts: !args.includes("--no-host-check") });
    console.info("action\tpublished\tslug\tmirrors (db)\thost now\treason");
    for (const row of rows) {
      console.info(
        [row.skip ? "skip" : "restore", row.isPublished ? "yes" : "no", row.slug, row.mirrors.join(","), row.live.join(",") || "-", row.skip ?? ""].join("\t"),
      );
    }
    const ready = rows.filter((row) => !row.skip);
    const summary = `restore=${ready.length} (published=${ready.filter((row) => row.isPublished).length}) skip=${rows.length - ready.length}`;
    if (!apply) {
      console.info(`VIDEOS RESTORE-HEALTH dry run: ${summary}; nothing changed. Re-run with --apply to write.`);
      return 0;
    }
    const restored = await applyHealthRestore(rows);
    console.info(`VIDEOS RESTORE-HEALTH applied: restored=${restored}; ${summary}. List pages pick them up within their revalidate window.`);
    return 0;
  }

  if (command === "csp:status") {
    // Read-only: player domains reported by browsers, and the admin alert.
    const [reports, fresh] = await Promise.all([listCspReports(), newPlayerDomains()]);
    const frames = reports.filter((entry) => entry.directive === "frame-src");
    console.info(`CSP reports: ${reports.length} kept (${frames.length} frame-src); alert (new player domains not yet seen by an admin): ${fresh.length}`);
    for (const entry of frames.slice(0, 15)) {
      console.info(`  ${entry.disposition === "enforce" ? "BLOCKED" : "report "} ${entry.blocked} x${entry.count} last ${entry.lastAt.slice(0, 16)}Z${fresh.some((domain) => domain.host === entry.blocked) ? " NEW" : ""}`);
    }
    return 0;
  }

  if (command === "csp:selftest") {
    // Report -> alert on this database, then the test entries are removed.
    const ok = await cspSelfTest();
    console.info(`CSP self-test: ${ok ? "OK (a new domain raises the admin alert)" : "FAILED (no alert)"}; test entries removed`);
    return ok ? 0 : 1;
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
    "Usage: tsx worker/cli.ts <sync:new|sync:health|backfill|media:resize [--dry-run]|slugs:lost-d|slugs:fix-d [--scope=drafts|published|all] [--ids=a,b] [--apply]|social:status|social:sync|social:channels|social:retry <slug>|social:cancel <slug>|videos:restore-health [--apply] [--no-host-check]|social:caption-upgrade [--dry-run]>",
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
