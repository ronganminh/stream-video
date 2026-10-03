import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

import {
  createTagAction,
  deleteTagAction,
  mergeTagAction,
  updateTagAction,
} from "./actions";
import styles from "./page.module.css";

export default async function AdminTagsPage() {
  await requireAdmin();

  const tags = await db.tag.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { videoTags: true },
      },
    },
  });

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>TAXONOMY</p>
          <h1>Tags</h1>
          <p className={styles.intro}>
            Create, rename, delete and merge tags without losing video
            assignments.
          </p>
        </div>
        <div className={styles.links}>
          <Link href="/admin/matching">Matching</Link>
          <Link href="/admin/categories">Categories</Link>
        </div>
      </div>

      <div className={styles.topGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Create tag</h2>
            <span>New label</span>
          </div>
          <form className={styles.form} action={createTagAction}>
            <label className={styles.field}>
              <span>Name</span>
              <input name="name" required maxLength={120} />
            </label>
            <label className={styles.field}>
              <span>Slug</span>
              <input
                name="slug"
                required
                maxLength={120}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              />
            </label>
            <div className={styles.actions}>
              <button type="submit">Create tag</button>
            </div>
          </form>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Merge tags</h2>
            <span>Move assignments, then delete source</span>
          </div>
          <form className={styles.form} action={mergeTagAction}>
            <label className={styles.field}>
              <span>Source tag</span>
              <select name="sourceTagId" required defaultValue="">
                <option value="" disabled>
                  Select source
                </option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name} ({tag._count.videoTags})
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Merge into</span>
              <select name="targetTagId" required defaultValue="">
                <option value="" disabled>
                  Select target
                </option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.actions}>
              <button type="submit">Merge tags</button>
            </div>
          </form>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>All tags</h2>
          <span>{tags.length} total</span>
        </div>

        <div className={styles.list}>
          {tags.map((tag) => (
            <article className={styles.tagRow} key={tag.id}>
              <form className={styles.editForm} action={updateTagAction}>
                <input type="hidden" name="id" value={tag.id} />
                <label className={styles.field}>
                  <span>Name</span>
                  <input
                    name="name"
                    defaultValue={tag.name}
                    required
                    maxLength={120}
                  />
                </label>
                <label className={styles.field}>
                  <span>Slug</span>
                  <input
                    name="slug"
                    defaultValue={tag.slug}
                    required
                    maxLength={120}
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  />
                </label>
                <span className={styles.usage}>
                  {tag._count.videoTags} video
                  {tag._count.videoTags === 1 ? "" : "s"}
                </span>
                <button type="submit">Save</button>
              </form>

              <form action={deleteTagAction}>
                <input type="hidden" name="id" value={tag.id} />
                <button className={styles.delete} type="submit">
                  Delete
                </button>
              </form>
            </article>
          ))}
        </div>

        {!tags.length ? (
          <p className={styles.empty}>No tags yet.</p>
        ) : null}
      </section>
    </main>
  );
}
