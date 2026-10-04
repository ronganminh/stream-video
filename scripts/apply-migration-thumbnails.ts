import { z } from "zod";

import { prisma } from "../lib/db";
import { hostRegistry } from "../lib/hosts/registry";
import { applySourceThumbnail } from "../lib/sync/thumbnailSources";

const payloadSchema = z
  .array(
    z.object({
      postId: z.string().min(1).max(120),
      sourceThumbnailUrl: z.string().url(),
      mirrors: z.record(z.string().min(1), z.string().min(1).max(240)),
    }),
  )
  .max(1_000);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of process.stdin) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.length;
    if (total > 2 * 1024 * 1024) {
      throw new Error("Thumbnail migration payload is too large.");
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const raw = await readStdin();
  const payload = payloadSchema.parse(JSON.parse(raw || "[]"));

  let applied = 0;
  let pending = 0;
  let failed = 0;

  for (const item of payload) {
    const mirrorPairs = Object.entries(item.mirrors).filter(([hostId]) =>
      hostRegistry.has(hostId),
    );

    if (mirrorPairs.length === 0) {
      console.log(`${item.postId}: NO_REGISTERED_MIRROR`);
      pending += 1;
      continue;
    }

    const mirrors = await prisma.mirror.findMany({
      where: {
        OR: mirrorPairs.map(([hostId, fileCode]) => ({
          hostId,
          fileCode,
        })),
      },
      select: {
        videoId: true,
      },
    });

    const videoIds = [...new Set(mirrors.map((mirror) => mirror.videoId))];

    if (videoIds.length === 0) {
      console.log(`${item.postId}: PENDING_VIDEO`);
      pending += 1;
      continue;
    }

    if (videoIds.length > 1) {
      console.log(`${item.postId}: AMBIGUOUS_VIDEO`);
      failed += 1;
      continue;
    }

    try {
      await applySourceThumbnail(videoIds[0], item.sourceThumbnailUrl);
      console.log(`${item.postId}: OK`);
      applied += 1;
    } catch (error) {
      console.log(
        `${item.postId}: ERROR ${error instanceof Error ? error.message : String(error)}`,
      );
      failed += 1;
    }
  }

  console.log(
    `APPLIED=${applied} PENDING=${pending} FAILED=${failed}`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  } else if (pending > 0) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
