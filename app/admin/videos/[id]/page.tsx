import type { HostFile } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { normalize } from "@/lib/sync/normalize";

import {
  linkMirrorAction,
  recheckMirrorAction,
  replaceThumbnailAction,
  saveVideoAction,
  unlinkMirrorAction,
} from "./actions";
import styles from "./page.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const availabilityValues = [
  "AVAILABLE",
  "PROCESSING",
  "REMOVED",
  "BLOCKED",
  "AGE_RESTRICTED",
  "REGION_RESTRICTED",
  "FAILED",
] as const;

function one(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

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

function rankCandidates(
  candidates: HostFile[],
  target: string,
): HostFile[] {
  return [...candidates]
    .sort(
      (left, right) =>
        similarity(right.normalizedName, target) -
          similarity(left.normalizedName, target) ||
        right.firstSeenAt.getTime() - left.firstSeenAt.getTime(),
    )
    .slice(0, 8);
}

export default async function AdminVideoEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const [routeParams, query] = await Promise.all([params, searchParams]);

  const [video, categories, tags, hosts] = await Promise.all([
    db.video.findUnique({
      where: { id: routeParams.id },
      include: {
        category: true,
        videoTags: { include: { tag: true } },
        mirrors: {
          include: { host: true },
          orderBy: { host: { sortOrder: "asc" } },
        },
      },
    }),
    db.category.findMany({
      orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.host.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!video) notFound();

  const activeSearchHost = one(query, "mirrorHost");
  const mirrorQuery = one(query, "mirrorQuery").trim();
  const selectedTags = new Set(video.videoTags.map(({ tagId }) => tagId));
  const targetName =
    video.mirrors[0]?.normalizedName || normalize(video.title);

  const candidateEntries = await Promise.all(
    hosts.map(async (host) => {
      const hostQuery =
        activeSearchHost === host.id && mirrorQuery
          ? mirrorQuery
          : targetName;
      const normalizedQuery = normalize(hostQuery);
      const firstToken = normalizedQuery.split(" ").filter(Boolean)[0] ?? "";

      const candidates = await db.hostFile.findMany({
        where: {
          hostId: host.id,
          ignored: false,
          OR: [
            { linkedVideoId: null },
            { linkedVideoId: video.id },
          ],
          ...(firstToken
            ? {
                AND: {
                  OR: [
                    {
                      normalizedName: {
                        contains: firstToken,
                      },
                    },
                    {
                      rawTitle: {
                        contains: hostQuery,
                        mode: "insensitive",
                      },
                    },
                  ],
                },
              }
            : {}),
        },
        orderBy: { firstSeenAt: "desc" },
        take: 80,
      });

      return [
        host.id,
        rankCandidates(candidates, hostQuery || targetName),
      ] as const;
    }),
  );
  const candidatesByHost = new Map(candidateEntries);

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>VIDEO EDITOR</p>
          <h1>{video.title}</h1>
          <p className={styles.intro}>
            Edit metadata, replace the thumbnail and manage one mirror per
            enabled host.
          </p>
        </div>
        <div className={styles.headingActions}>
          <Link href="/admin/review">Review queue</Link>
          <Link href="/admin/videos">All videos</Link>
        </div>
      </div>

      <div className={styles.topGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Thumbnail</h2>
            <span>{video.thumbnailPath ?? "Not set"}</span>
          </div>
          <div
            className={styles.thumbnail}
            style={{
              backgroundImage: video.thumbnailPath
                ? `url("${video.thumbnailPath.replaceAll('"', "%22")}")`
                : undefined,
            }}
          >
            {!video.thumbnailPath ? <span>No thumbnail</span> : null}
          </div>
          <form
            className={styles.thumbnailForm}
            action={replaceThumbnailAction}
          >
            <input type="hidden" name="id" value={video.id} />
            <label className={styles.field}>
              <span>Replace thumbnail</span>
              <input
                name="thumbnail"
                type="file"
                accept="image/*"
                required
              />
              <small>
                Converted to WebP and stored under the same /media path used
                by sync thumbnails.
              </small>
            </label>
            <button type="submit">Upload thumbnail</button>
          </form>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Playback preview</h2>
            <span>
              {video.mirrors.filter((mirror) => mirror.status === "OK").length}
              {" "}OK
            </span>
          </div>
          <div className={styles.embed}>
            {video.mirrors.find((mirror) => mirror.status === "OK") ? (
              <iframe
                src={
                  video.mirrors.find((mirror) => mirror.status === "OK")!
                    .embedUrl
                }
                title={`Preview: ${video.title}`}
                loading="lazy"
                allowFullScreen
              />
            ) : (
              <div>No playable mirror</div>
            )}
          </div>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Metadata</h2>
          <span>{video.id}</span>
        </div>
        <form className={styles.form} action={saveVideoAction}>
          <input type="hidden" name="id" value={video.id} />

          <div className={styles.twoColumns}>
            <label className={styles.field}>
              <span>Title</span>
              <input
                name="title"
                defaultValue={video.title}
                required
                maxLength={240}
              />
            </label>
            <label className={styles.field}>
              <span>Slug</span>
              <input
                name="slug"
                defaultValue={video.slug}
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                maxLength={240}
              />
            </label>
          </div>

          <label className={styles.field}>
            <span>Description</span>
            <textarea
              name="description"
              defaultValue={video.description ?? ""}
              rows={5}
            />
          </label>

          <div className={styles.fourColumns}>
            <label className={styles.field}>
              <span>Duration (seconds)</span>
              <input
                name="durationSeconds"
                type="number"
                min="0"
                defaultValue={video.durationSeconds ?? ""}
              />
            </label>
            <label className={styles.field}>
              <span>Quality</span>
              <select name="quality" defaultValue={video.quality ?? ""}>
                <option value="">Not set</option>
                <option value="HD">HD</option>
                <option value="4K">4K</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Status</span>
              <select name="status" defaultValue={video.status}>
                {availabilityValues.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Category</span>
              <select
                name="categoryId"
                defaultValue={video.categoryId ?? ""}
              >
                <option value="">Uncategorized</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={styles.field}>
            <span>Tags</span>
            <select
              name="tagId"
              multiple
              defaultValue={[...selectedTags]}
              size={Math.min(8, Math.max(4, tags.length))}
            >
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.toggles}>
            <label>
              <input
                name="isPublished"
                type="checkbox"
                defaultChecked={video.isPublished}
              />
              Published
            </label>
            <label>
              <input
                name="isHidden"
                type="checkbox"
                defaultChecked={video.isHidden}
              />
              Hidden
            </label>
            <label>
              <input
                name="hotOverride"
                type="checkbox"
                defaultChecked={video.hotOverride}
              />
              Hot override
            </label>
            <label>
              <input
                name="ageRestricted"
                type="checkbox"
                defaultChecked={video.ageRestricted}
              />
              Age restricted
            </label>
          </div>

          <div className={styles.actions}>
            <button type="submit">Save video</button>
          </div>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Mirrors</h2>
          <span>One mirror per enabled host</span>
        </div>

        <div className={styles.mirrors}>
          {hosts.map((host) => {
            const mirror = video.mirrors.find(
              (item) => item.hostId === host.id,
            );
            const candidates = candidatesByHost.get(host.id) ?? [];

            return (
              <article className={styles.mirrorCard} key={host.id}>
                <div className={styles.mirrorHeading}>
                  <div>
                    <h3>{host.label}</h3>
                    <span>
                      {mirror
                        ? `${mirror.status} · ${mirror.matchedBy}`
                        : "Not linked"}
                    </span>
                  </div>
                  {host.isPrimary ? <em>Primary</em> : null}
                </div>

                {mirror ? (
                  <>
                    <dl className={styles.mirrorMeta}>
                      <div><dt>File code</dt><dd>{mirror.fileCode}</dd></div>
                      <div><dt>Raw title</dt><dd>{mirror.rawTitle}</dd></div>
                      <div>
                        <dt>Checked</dt>
                        <dd>
                          {mirror.lastCheckedAt?.toISOString() ?? "Never"}
                        </dd>
                      </div>
                    </dl>
                    <div className={styles.mirrorActions}>
                      <form action={recheckMirrorAction}>
                        <input
                          type="hidden"
                          name="videoId"
                          value={video.id}
                        />
                        <input
                          type="hidden"
                          name="mirrorId"
                          value={mirror.id}
                        />
                        <button type="submit">Re-check</button>
                      </form>
                      <form action={unlinkMirrorAction}>
                        <input
                          type="hidden"
                          name="videoId"
                          value={video.id}
                        />
                        <input
                          type="hidden"
                          name="mirrorId"
                          value={mirror.id}
                        />
                        <button
                          className={styles.danger}
                          type="submit"
                        >
                          Unlink
                        </button>
                      </form>
                    </div>
                  </>
                ) : (
                  <>
                    <form className={styles.searchForm} method="get">
                      <input
                        type="hidden"
                        name="mirrorHost"
                        value={host.id}
                      />
                      <label className={styles.field}>
                        <span>Search host files</span>
                        <input
                          name="mirrorQuery"
                          defaultValue={
                            activeSearchHost === host.id
                              ? mirrorQuery
                              : ""
                          }
                          placeholder={video.title}
                        />
                      </label>
                      <button type="submit">Search</button>
                    </form>

                    <div className={styles.suggestions}>
                      <span className={styles.suggestionLabel}>
                        Search / similarity suggestions
                      </span>
                      {candidates.length ? (
                        candidates.map((candidate) => (
                          <form
                            className={styles.candidate}
                            action={linkMirrorAction}
                            key={candidate.id}
                          >
                            <input
                              type="hidden"
                              name="videoId"
                              value={video.id}
                            />
                            <input
                              type="hidden"
                              name="hostId"
                              value={host.id}
                            />
                            <input
                              type="hidden"
                              name="fileCode"
                              value={candidate.fileCode}
                            />
                            <span>
                              <strong>{candidate.rawTitle}</strong>
                              <code>{candidate.fileCode}</code>
                            </span>
                            <span className={styles.score}>
                              {Math.round(
                                similarity(
                                  candidate.normalizedName,
                                  activeSearchHost === host.id &&
                                    mirrorQuery
                                    ? mirrorQuery
                                    : targetName,
                                ) * 100,
                              )}
                              %
                            </span>
                            <button type="submit">Link</button>
                          </form>
                        ))
                      ) : (
                        <p className={styles.muted}>
                          No unlinked host files match this search.
                        </p>
                      )}
                    </div>

                    <form
                      className={styles.directLink}
                      action={linkMirrorAction}
                    >
                      <input
                        type="hidden"
                        name="videoId"
                        value={video.id}
                      />
                      <input
                        type="hidden"
                        name="hostId"
                        value={host.id}
                      />
                      <label className={styles.field}>
                        <span>Link by file code</span>
                        <input
                          name="fileCode"
                          placeholder="Host file code"
                          required
                        />
                      </label>
                      <button type="submit">Link code</button>
                    </form>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
