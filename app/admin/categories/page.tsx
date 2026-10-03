import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "./actions";
import styles from "./page.module.css";

export default async function AdminCategoriesPage() {
  await requireAdmin();

  const categories = await db.category.findMany({
    orderBy: [
      { group: "asc" },
      { sortOrder: "asc" },
      { name: "asc" },
    ],
    include: {
      _count: {
        select: { videos: true },
      },
    },
  });

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>TAXONOMY</p>
          <h1>Categories</h1>
          <p className={styles.intro}>
            Manage category groups, ordering, artwork and trending state.
          </p>
        </div>
        <div className={styles.links}>
          <Link href="/admin/matching">Matching</Link>
          <Link href="/admin/tags">Tags</Link>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Create category</h2>
          <span>New taxonomy entry</span>
        </div>
        <form
          className={styles.form}
          action={createCategoryAction}
          encType="multipart/form-data"
        >
          <div className={styles.grid}>
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
            <label className={styles.field}>
              <span>Group</span>
              <input name="group" required maxLength={80} />
            </label>
            <label className={styles.field}>
              <span>Sort order</span>
              <input
                name="sortOrder"
                type="number"
                min="0"
                defaultValue="0"
                required
              />
            </label>
          </div>
          <label className={styles.field}>
            <span>Description</span>
            <textarea name="description" rows={3} maxLength={500} />
          </label>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Image</span>
              <input
                name="image"
                type="file"
                accept="image/*"
              />
            </label>
            <label className={styles.toggle}>
              <input name="trending" type="checkbox" />
              <span>Trending category</span>
            </label>
          </div>
          <div className={styles.actions}>
            <button type="submit">Create category</button>
          </div>
        </form>
      </section>

      <div className={styles.list}>
        {categories.map((category) => (
          <section className={styles.panel} key={category.id}>
            <div className={styles.panelHeading}>
              <div>
                <h2>{category.name}</h2>
                <span>
                  {category.group} · {category._count.videos} videos
                </span>
              </div>
              {category.trending ? <em>Trending</em> : null}
            </div>

            <div className={styles.categoryPreview}>
              <div
                className={styles.image}
                style={{
                  backgroundImage: category.thumbnailPath
                    ? `url("${category.thumbnailPath.replaceAll('"', "%22")}")`
                    : undefined,
                }}
              >
                {!category.thumbnailPath ? <span>No image</span> : null}
              </div>

              <form
                className={styles.form}
                action={updateCategoryAction}
                encType="multipart/form-data"
              >
                <input type="hidden" name="id" value={category.id} />
                <div className={styles.grid}>
                  <label className={styles.field}>
                    <span>Name</span>
                    <input
                      name="name"
                      defaultValue={category.name}
                      required
                      maxLength={120}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Slug</span>
                    <input
                      name="slug"
                      defaultValue={category.slug}
                      required
                      maxLength={120}
                      pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Group</span>
                    <input
                      name="group"
                      defaultValue={category.group}
                      required
                      maxLength={80}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Sort order</span>
                    <input
                      name="sortOrder"
                      type="number"
                      min="0"
                      defaultValue={category.sortOrder}
                      required
                    />
                  </label>
                </div>

                <label className={styles.field}>
                  <span>Description</span>
                  <textarea
                    name="description"
                    rows={3}
                    maxLength={500}
                    defaultValue={category.description ?? ""}
                  />
                </label>

                <div className={styles.grid}>
                  <label className={styles.field}>
                    <span>Replace image</span>
                    <input
                      name="image"
                      type="file"
                      accept="image/*"
                    />
                  </label>
                  <label className={styles.toggle}>
                    <input
                      name="trending"
                      type="checkbox"
                      defaultChecked={category.trending}
                    />
                    <span>Trending category</span>
                  </label>
                </div>

                <div className={styles.actions}>
                  <button type="submit">Save category</button>
                </div>
              </form>
            </div>

            <form
              className={styles.deleteForm}
              action={deleteCategoryAction}
            >
              <input type="hidden" name="id" value={category.id} />
              <p>
                Deleting moves {category._count.videos} assigned video
                {category._count.videos === 1 ? "" : "s"} to Uncategorized.
              </p>
              <button type="submit">Delete category</button>
            </form>
          </section>
        ))}
      </div>
    </main>
  );
}
