/** Category placeholder for videos without one (see lib/data/prisma/watch). */
export const UNCATEGORIZED_SLUG = "uncategorized";

export type Crumb = { name: string; path: string };

/**
 * Home › Category › Title for a watch page. Videos without a category skip
 * the middle step: there is no /category/uncategorized page to link to.
 * Shared by the visible breadcrumb and the BreadcrumbList JSON-LD.
 */
export function watchBreadcrumbs(
  slug: string,
  video: { title: string; category: { slug: string; name: string } | null },
): Crumb[] {
  const category =
    video.category && video.category.slug !== UNCATEGORIZED_SLUG ? video.category : null;
  return [
    { name: "Home", path: "/" },
    ...(category ? [{ name: category.name, path: `/category/${category.slug}` }] : []),
    { name: video.title, path: `/watch/${slug}` },
  ];
}
