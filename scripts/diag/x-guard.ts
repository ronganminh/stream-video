// X posts around the restore of health-removed videos. Prints no keys or links.
//   guard : before restoring, sends back to "Cắt lại" (recut) every X post not
//           yet in Buffer (waiting/queued) whose clip is well under its planned
//           length (e.g. seachan's 2 s clip), so restoring the video cannot
//           push that clip to X. The recut deletes the bad clip.
//   report: X posts of the given slugs, and video status counts.
//   tsx x-guard.ts guard|report [slug ...]
import { prisma } from "/app/lib/db";
import { recutClip } from "/app/lib/social/clipJobs";
import { socialConfig } from "/app/lib/social/config";
import { plannedClipSeconds } from "/app/lib/social/reviewPost";

const [mode, ...slugs] = process.argv.slice(2);
const config = socialConfig();

async function show(label: string) {
  const posts = await prisma.socialPost.findMany({
    where: slugs.length ? { video: { slug: { in: slugs } } } : { status: { in: ["waiting", "queued"] } },
    include: { video: { select: { slug: true, status: true, isPublished: true, durationSeconds: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n== X posts (${label}): ${posts.length}`);
  for (const p of posts) {
    const planned = p.clipMode
      ? plannedClipSeconds(p.clipMode === "full" ? "full" : "clip", p.clipStart ?? 0, p.video.durationSeconds, config)
      : null;
    console.log(
      `  ${p.video.slug} video=${p.video.status}/${p.video.isPublished ? "published" : "draft"} post=${p.status} ` +
        `mode=${p.clipMode} clip=${p.clipFile ? "yes" : "no"} clipSeconds=${p.clipSeconds} planned=${planned} ` +
        `attempts=${p.attempts} quotaWaits=${p.quotaWaits} next=${p.nextAttemptAt?.toISOString() ?? "-"} ` +
        `error=${(p.lastError ?? "").replace(/https?:\/\/\S+/g, "[link]").slice(0, 160)}`,
    );
  }
  return posts;
}

async function main() {
  if (mode === "guard") {
    const posts = await show("before guard: waiting/queued");
    let recut = 0;
    for (const p of posts) {
      if (!p.clipMode || !p.clipFile) continue;
      const planned = plannedClipSeconds(p.clipMode === "full" ? "full" : "clip", p.clipStart ?? 0, p.video.durationSeconds, config);
      if (p.clipSeconds !== null && p.clipSeconds < planned - 2) {
        const ok = await recutClip(p.id, prisma, undefined, config);
        console.log(`  GUARD recut ${p.video.slug}: clip ${p.clipSeconds}s < planned ${planned}s -> ${ok ? "preparing (clip deleted)" : "NOT recut"}`);
        if (ok) recut += 1;
        else process.exitCode = 3;
      }
    }
    console.log(`GUARD done: recut=${recut}`);
  } else {
    await show("report");
    const counts = await prisma.video.groupBy({ by: ["status", "isPublished"], _count: true });
    console.log("\n== video status counts");
    for (const c of counts) console.log(`  ${c.status} ${c.isPublished ? "published" : "draft"}: ${c._count}`);
    const health = await prisma.video.count({ where: { removedBy: "health" } });
    console.log(`  removedBy=health: ${health}`);
  }
}
main().finally(() => prisma.$disconnect());
