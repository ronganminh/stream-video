import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { normalize } from "@/lib/sync/normalize";

import {
  ignoreHostFileAction,
  linkHostFileAction,
} from "./actions";
import styles from "./page.module.css";

function similarity(left: string, right: string): number {
  const a = new Set(normalize(left).split(" ").filter(Boolean));
  const b = new Set(normalize(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / new Set([...a, ...b]).size;
}

export default async function AdminMatchingPage() {
  await requireAdmin();

  const files = await db.hostFile.findMany({
    where: {
      ignored: false,
      linkedVideoId: null,
      host: {
        is: {
          isPrimary: false,
          enabled: true,
        },
      },
    },
    include: {
      host: true,
    },
    orderBy: [
      { normalizedName: "asc" },
      { firstSeenAt: "desc" },
    ],
    take: 100,
  });

  const duplicateCounts = new Map<string, number>();
  for (const file of files) {
    const key = `${file.hostId}:${file.normalizedName}`;
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }

  const queue = await Promise.all(
    files.map(async (file) => {
      const firstToken =
        file.normalizedName.split(" ").filter(Boolean)[0] ?? "";

      const candidates = await db.video.findMany({
        where: {
          mirrors: {
            none: { hostId: file.hostId },
          },
          ...(firstToken
            ? {
                OR: [
                  {
                    title: {
                      contains: firstToken,
                      mode: "insensitive",
                    },
                  },
                  {
                    mirrors: {
                      some: {
                        normalizedName: {
                          contains: firstToken,
                        },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          slug: true,
          isPublished: true,
          isHidden: true,
          mirrors: {
            select: {
              normalizedName: true,
            },
            take: 4,
          },
        },
        take: 40,
      });

      const ranked = candidates
        .map((video) => {
          const names = video.mirrors.length
            ? video.mirrors.map((mirror) => mirror.normalizedName)
            : [normalize(video.title)];
          const score = Math.max(
            ...names.map((name) =>
              similarity(file.normalizedName, name),
            ),
          );
          return { ...video, score };
        })
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, 5);

      return {
        file,
        duplicateCount:
          duplicateCounts.get(
            `${file.hostId}:${file.normalizedName}`,
          ) ?? 1,
        suggestions: ranked,
      };
    }),
  );

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>MANUAL MATCHING</p>
          <h1>Matching queue</h1>
          <p className={styles.intro}>
            Resolve unmatched files from enabled secondary hosts. Duplicate
            normalized names stay visible for manual review.
          </p>
        </div>
        <div className={styles.links}>
          <Link href="/admin/categories">Categories</Link>
          <Link href="/admin/tags">Tags</Link>
        </div>
      </div>

      {queue.length ? (
        <div className={styles.queue}>
          {queue.map(({ file, duplicateCount, suggestions }) => (
            <article className={styles.card} key={file.id}>
              <div className={styles.fileHeading}>
                <div>
                  <div className={styles.hostLine}>
                    <strong>{file.host.label}</strong>
                    {duplicateCount > 1 ? (
                      <span>{duplicateCount} duplicate names</span>
                    ) : null}
                  </div>
                  <h2>{file.rawTitle}</h2>
                  <code>{file.fileCode}</code>
                </div>
                <form action={ignoreHostFileAction}>
                  <input
                    type="hidden"
                    name="hostFileId"
                    value={file.id}
                  />
                  <button className={styles.ignore} type="submit">
                    Ignore
                  </button>
                </form>
              </div>

              <div className={styles.normalized}>
                <span>Normalized</span>
                <code>{file.normalizedName}</code>
              </div>

              <div className={styles.suggestions}>
                <p>Suggested videos</p>
                {suggestions.length ? (
                  suggestions.map((video) => (
                    <form
                      className={styles.suggestion}
                      action={linkHostFileAction}
                      key={video.id}
                    >
                      <input
                        type="hidden"
                        name="hostFileId"
                        value={file.id}
                      />
                      <input
                        type="hidden"
                        name="videoId"
                        value={video.id}
                      />
                      <span className={styles.videoMeta}>
                        <strong>{video.title}</strong>
                        <code>{video.slug}</code>
                        <small>
                          {video.isPublished ? "Published" : "Draft"}
                          {video.isHidden ? " · Hidden" : ""}
                        </small>
                      </span>
                      <span className={styles.score}>
                        {Math.round(video.score * 100)}%
                      </span>
                      <button type="submit">Link</button>
                    </form>
                  ))
                ) : (
                  <p className={styles.muted}>
                    No plausible video suggestions.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className={styles.empty}>
          <h2>Matching queue is clear</h2>
          <p>No unmatched secondary-host files need review.</p>
        </section>
      )}
    </main>
  );
}
