// Read-only: why are these videos REMOVED/BLOCKED? Prints no keys or Drive links.
// Runs inside the worker container (it has tsx, lib/ and the host API keys):
//   curl -fsSLo removed-diag.ts https://raw.githubusercontent.com/ronganminh/stream-video/diag/removed-videos/scripts/diag/removed-diag.ts
//   docker compose exec -T worker sh -c 'cat > /tmp/diag.ts && ./node_modules/.bin/tsx /tmp/diag.ts <slug> [<slug> ...]' < removed-diag.ts
// Prints each video's status and dates, its mirrors (DB status and a live host
// API check), admin actions on it, the last HEALTH runs' errors, and every
// REMOVED/BLOCKED video grouped by mirror status. Writes nothing.
import { prisma } from "/app/lib/db";
import { getHostProvider } from "/app/lib/hosts/registry";

const slugs = process.argv.slice(2);
const clean = (s: string) => s.replace(/key=[^&\s]+/gi, "key=***").replace(/https?:\/\/\S+/g, "[link]").slice(0, 200);

async function main() {
  for (const slug of slugs) {
    const v = await prisma.video.findUnique({
      where: { slug },
      include: { mirrors: { include: { host: { select: { isPrimary: true } } } } },
    });
    if (!v) { console.log(`\n== ${slug}: not found`); continue; }
    console.log(`\n== ${slug}\nstatus=${v.status} published=${v.isPublished} hidden=${v.isHidden} createdAt=${v.createdAt.toISOString()} publishedAt=${v.publishedAt?.toISOString()} updatedAt=${v.updatedAt.toISOString()}`);
    for (const m of v.mirrors) {
      let live = "";
      try {
        const info = await getHostProvider(m.hostId)?.getFileInfo(m.fileCode);
        live = info ? `OK (${info.lengthSeconds ?? "?"} s)` : "MISSING (404 / không có trong kết quả)";
      } catch (e) { live = `ERROR: ${clean(e instanceof Error ? e.message : String(e))}`; }
      console.log(`  ${m.hostId}${m.host.isPrimary ? " (primary)" : ""} file=${m.fileCode} db=${m.status} lastChecked=${m.lastCheckedAt?.toISOString()} | API now: ${live}`);
    }
    const actions = await prisma.adminAction.findMany({ where: { target: { contains: v.id } }, orderBy: { at: "asc" } });
    for (const a of actions) console.log(`  admin ${a.at.toISOString()} ${a.action}`);
  }
  const runs = await prisma.syncRun.findMany({ where: { kind: "HEALTH" }, orderBy: { startedAt: "desc" }, take: 6 });
  console.log("\n== last HEALTH runs");
  for (const r of runs) {
    const errors = (r.errors as string[]) ?? [];
    console.log(`  ${r.startedAt.toISOString()} → ${r.finishedAt?.toISOString()} missing=${r.missing} errors=${errors.length}`);
    const kinds = new Map<string, number>();
    for (const e of errors) { const k = clean(e).replace(/file \S+/, "file …"); kinds.set(k, (kinds.get(k) ?? 0) + 1); }
    for (const [k, n] of [...kinds].slice(0, 6)) console.log(`     ${n}× ${k}`);
  }
  // Every REMOVED video, grouped by what its mirrors say.
  const removed = await prisma.video.findMany({ where: { status: { in: ["REMOVED", "BLOCKED"] } }, include: { mirrors: { select: { hostId: true, status: true } } } });
  const groups = new Map<string, number>();
  for (const v of removed) {
    const key = `${v.status} published=${v.isPublished} mirrors=[${v.mirrors.map((m) => `${m.hostId}:${m.status}`).sort().join(",") || "none"}]`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  console.log(`\n== REMOVED/BLOCKED videos: ${removed.length}`);
  for (const [k, n] of [...groups].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${k}`);
}
main().finally(() => prisma.$disconnect());
