import {
  getCategory,
  getHot,
  getMostViewed,
} from "@/lib/data";
import type { ListPage, ListQuery } from "@/lib/types";

export type CategoryListQuery = Pick<
  ListQuery,
  "sort" | "duration" | "date" | "page"
>;

function rebaseHref(
  href: string | undefined,
  slug: string,
): string | undefined {
  if (!href) return undefined;
  const query = href.includes("?") ? href.slice(href.indexOf("?")) : "";
  return `/category/${slug}${query}`;
}

export async function getCategoryPageData(
  slug: string,
  query: CategoryListQuery,
) {
  const sort = query.sort || "trending";
  const base = await getCategory(slug, { page: 1 });
  if (!base) return null;

  let videos: ListPage;

  if (sort === "trending") {
    videos = await getHot({
      category: slug,
      duration: query.duration,
      date: query.date,
      page: query.page,
    });
  } else if (sort === "most-viewed") {
    videos = await getMostViewed({
      category: slug,
      duration: query.duration,
      date: query.date,
      page: query.page,
    });
  } else {
    const result = await getCategory(slug, {
      sort,
      duration: query.duration,
      date: query.date,
      page: query.page,
    });
    if (!result) return null;
    videos = result.videos;
  }

  return {
    category: base.category,
    relatedTags: base.relatedTags,
    videos: {
      ...videos,
      nextHref: rebaseHref(videos.nextHref, slug),
      prevHref: rebaseHref(videos.prevHref, slug),
    },
  };
}
