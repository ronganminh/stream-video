import type { Metadata } from "next";
import Link from "next/link";

import { getCategories } from "@/lib/data";
import { jsonLdHtml } from "@/lib/seo/jsonLd";
import { listShareMetadata } from "@/lib/seo/metadata";

import { CategoryBrowser } from "./CategoryBrowser";
import styles from "./page.module.css";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Browse Categories | GayVideo.fun",
  ...listShareMetadata({
    title: "Browse Categories",
    description:
      "Browse every gay video category on GayVideo.fun, from trending picks to niche collections.",
    canonical: "/categories",
  }),
  alternates: {
    canonical: "/categories",
  },
};

export default async function CategoriesPage() {
  const categories = await getCategories();

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://gayvideo.fun/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Categories",
        item: "https://gayvideo.fun/categories",
      },
    ],
  };

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbs) }}
      />

      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">›</span>
        <span>Categories</span>
      </nav>

      <div className={styles.hero}>
        <div>
          <h1>Browse Categories</h1>
          <p>Find something when you don&apos;t know what to search for.</p>
        </div>
      </div>

      <CategoryBrowser categories={categories} />
    </main>
  );
}
