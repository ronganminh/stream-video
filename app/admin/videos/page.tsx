import type { Availability, Prisma } from "@prisma/client";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

import { bulkVideoAction } from "./actions";
import styles from "./page.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const statusValues = [
  "AVAILABLE",
  "PROCESSING",
  "REMOVED",
  "BLOCKED",
  "AGE_RESTRICTED",
  "REGION_RESTRICTED",
  "FAILED",
] as const satisfies readonly Availability[];

function one(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

export default async function AdminVideosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const params = await searchParams;

  const q = one(params, "q").trim();
  const status = one(params, "status");
  const published = one(params, "published");
  const hidden = one(params, "hidden");
  const category = one(params, "category");
  const missingHost = one(params, "missingHost");

  const where: Prisma.VideoWhereInput = {
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(statusValues.includes(status as Availability)
      ? { status: status as Availability }
      : {}),
    ...(published === "yes"
      ? { isPublished: true }
      : published === "no"
        ? { isPublished: false }
        : {}),
    ...(hidden === "yes"
      ? { isHidden: true }
      : hidden === "no"
        ? { isHidden: false }
        : {}),
    ...(category ? { categoryId: category } : {}),
    ...(missingHost
      ? {
          mirrors: {
            none: {
              hostId: missingHost,
              status: "OK",
            },
          },
        }
      : {}),
  };

  const [videos, categories, tags, hosts] = await Promise.all([
    db.video.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
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
    db.host.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>CONTENT LIBRARY</p>
          <h1>Videos</h1>
          <p className={styles.intro}>
            Search, filter, bulk-edit and open any video for full editing.
          </p>
        </div>
        <Link className={styles.reviewLink} href="/admin/review">
          Review queue
        </Link>
      </div>

      <form className={styles.filters} method="get">
        <label className={styles.field}>
          <span>Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Title or slug"
          />
        </label>
        <label className={styles.field}>
          <span>Status</span>
          <select name="status" defaultValue={status}>
            <option value="">Any status</option>
            {statusValues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Published</span>
          <select name="published" defaultValue={published}>
            <option value="">Any</option>
            <option value="yes">Published</option>
            <option value="no">Draft</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Hidden</span>
          <select name="hidden" defaultValue={hidden}>
            <option value="">Any</option>
            <option value="no">Visible</option>
            <option value="yes">Hidden</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Category</span>
          <select name="category" defaultValue={category}>
            <option value="">Any category</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Missing host</span>
          <select name="missingHost" defaultValue={missingHost}>
            <option value="">Any host</option>
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.filterActions}>
          <button type="submit">Apply filters</button>
          <Link href="/admin/videos">Reset</Link>
        </div>
      </form>

      <form
        id="bulk-video-form"
        className={styles.bulk}
        action={bulkVideoAction}
      >
        <span>Bulk action for selected videos</span>
        <select name="categoryId" aria-label="Bulk category">
          <option value="">Uncategorized</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button name="intent" value="apply-category" type="submit">
          Set category
        </button>
        <select
          className={styles.tagSelect}
          name="tagId"
          multiple
          aria-label="Bulk tags"
          size={3}
        >
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <button name="intent" value="replace-tags" type="submit">
          Replace tags
        </button>
        <button name="intent" value="hide" type="submit">
          Hide
        </button>
        <button name="intent" value="unhide" type="submit">
          Unhide
        </button>
      </form>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th aria-label="Select" />
              <th>Video</th>
              <th>Status</th>
              <th>Category</th>
              <th>Mirrors</th>
              <th>Updated</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => {
              const okHosts = video.mirrors.filter(
                (mirror) => mirror.status === "OK",
              );
              return (
                <tr key={video.id}>
                  <td>
                    <input
                      form="bulk-video-form"
                      type="checkbox"
                      name="videoId"
                      value={video.id}
                      aria-label={`Select ${video.title}`}
                    />
                  </td>
                  <td>
                    <strong>{video.title}</strong>
                    <code>{video.slug}</code>
                    <div className={styles.badges}>
                      {!video.isPublished ? <span>Draft</span> : null}
                      {video.isHidden ? <span>Hidden</span> : null}
                    </div>
                  </td>
                  <td>{video.status}</td>
                  <td>{video.category?.name ?? "Uncategorized"}</td>
                  <td>
                    <span className={styles.mirrorCount}>
                      {okHosts.length} OK / {video.mirrors.length} total
                    </span>
                  </td>
                  <td>{video.updatedAt.toISOString()}</td>
                  <td>
                    <Link href={`/admin/videos/${video.id}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!videos.length ? (
          <div className={styles.empty}>
            No videos match these filters.
          </div>
        ) : null}
      </div>
    </main>
  );
}
