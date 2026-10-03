import { categories } from "../fixtures/categories";
import { tags } from "../fixtures/tags";
import { videos } from "../fixtures/videos";
import type {
  Category,
  ListPage,
  ListQuery,
  MirrorPublic,
  SearchResult,
  Tag,
  VideoCard,
  VideoPage,
} from "../types";
import {
  getCategoriesPrisma,
  getCategoryPrisma,
  getTagPrisma,
} from "./prisma/categories";
import { getHomePrisma } from "./prisma/home";
import {
  getHotPrisma,
  getLatestPrisma,
  getMostViewedPrisma,
} from "./prisma/lists";

const PAGE_SIZE = 20;

const isVisible = (video: VideoCard) =>
  (video.availability ?? "AVAILABLE") === "AVAILABLE";

const visibleVideos = () => videos.filter(isVisible);

const normalizePage = (page?: number) =>
  Number.isInteger(page) && (page ?? 0) > 0 ? (page as number) : 1;

function makePage(
  items: VideoCard[],
  page: number,
  path: string,
  query: ListQuery = {},
  extraParams: Record<string, string> = {},
): ListPage {
  const currentPage = normalizePage(page);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pagedItems = items.slice(start, start + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  const href = (targetPage: number) => {
    const params = new URLSearchParams(extraParams);
    for (const [key, value] of Object.entries(query)) {
      if (key === "page" || value === undefined || value === "") continue;
      params.set(key, String(value));
    }
    params.set("page", String(targetPage));
    return `${path}?${params.toString()}`;
  };

  return {
    items: pagedItems,
    page: currentPage,
    pageSize: PAGE_SIZE,
    total: items.length,
    nextHref: currentPage < totalPages ? href(currentPage + 1) : undefined,
    prevHref: currentPage > 1 ? href(currentPage - 1) : undefined,
  };
}

const categoryForVideo = (video: VideoCard): Category => {
  const numericId = Number(video.id.split("-")[1] ?? 1);
  return categories[(numericId - 1) % categories.length];
};

const tagsForVideo = (video: VideoCard): Tag[] => {
  const numericId = Number(video.id.split("-")[1] ?? 1);
  return [
    tags[(numericId - 1) % tags.length],
    tags[(numericId + 6) % tags.length],
    tags[(numericId + 15) % tags.length],
  ];
};

const sortNewest = (items: VideoCard[]) =>
  [...items].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );

const sortMostViewed = (items: VideoCard[]) =>
  [...items].sort((a, b) => b.views - a.views);

function applyListFilters(items: VideoCard[], query: ListQuery): VideoCard[] {
  let result = [...items];

  if (query.category) {
    result = result.filter(
      (video) => categoryForVideo(video).slug === query.category,
    );
  }

  if (query.duration) {
    result = result.filter((video) => {
      if (video.durationSeconds === null) return false;
      if (query.duration === "under-5") return video.durationSeconds < 300;
      if (query.duration === "5-15") {
        return video.durationSeconds >= 300 && video.durationSeconds < 900;
      }
      if (query.duration === "15-30") {
        return video.durationSeconds >= 900 && video.durationSeconds < 1_800;
      }
      if (query.duration === "30-plus") return video.durationSeconds >= 1_800;
      return true;
    });
  }

  if (query.date) {
    const now = Date.now();
    const maxAge =
      query.date === "today"
        ? 24 * 60 * 60 * 1_000
        : query.date === "week"
          ? 7 * 24 * 60 * 60 * 1_000
          : query.date === "month"
            ? 30 * 24 * 60 * 60 * 1_000
            : Number.POSITIVE_INFINITY;
    result = result.filter(
      (video) => now - Date.parse(video.publishedAt) <= maxAge,
    );
  }

  if (query.sort === "views" || query.sort === "most-viewed") {
    return sortMostViewed(result);
  }

  if (query.sort === "longest") {
    return result.sort(
      (a, b) => (b.durationSeconds ?? -1) - (a.durationSeconds ?? -1),
    );
  }

  return sortNewest(result);
}

export async function getHome() {
  return getHomePrisma();
}

export async function getHot(query: ListQuery = {}): Promise<ListPage> {
  return getHotPrisma(query);
}

export async function getMostViewed(query: ListQuery = {}): Promise<ListPage> {
  return getMostViewedPrisma(query);
}

export async function getLatest(query: ListQuery = {}): Promise<ListPage> {
  return getLatestPrisma(query);
}

export async function getCategories(): Promise<Category[]> {
  return getCategoriesPrisma();
}

export async function getCategory(slug: string, query: ListQuery = {}) {
  return getCategoryPrisma(slug, query);
}

export async function getTag(slug: string, query: ListQuery = {}) {
  return getTagPrisma(slug, query);
}

export async function search(
  searchQuery: string,
  query: ListQuery = {},
): Promise<SearchResult> {
  const needle = searchQuery.trim().toLowerCase();
  const available = applyListFilters(visibleVideos(), query);
  const matched = needle
    ? available.filter((video) => {
        const category = categoryForVideo(video);
        const videoTags = tagsForVideo(video);
        return (
          video.title.toLowerCase().includes(needle) ||
          category.name.toLowerCase().includes(needle) ||
          category.slug.includes(needle) ||
          videoTags.some(
            (tag) =>
              tag.name.toLowerCase().includes(needle) || tag.slug.includes(needle),
          )
        );
      })
    : available;

  const list = makePage(matched, normalizePage(query.page), "/search", query, {
    q: searchQuery,
  });
  const relatedCategories = categories
    .filter(
      (category) =>
        !needle ||
        category.name.toLowerCase().includes(needle) ||
        category.slug.includes(needle),
    )
    .slice(0, 6)
    .map((category) => ({ ...category }));
  const relatedTags = tags
    .filter(
      (tag) =>
        !needle ||
        tag.name.toLowerCase().includes(needle) ||
        tag.slug.includes(needle),
    )
    .slice(0, 8)
    .map((tag) => ({ ...tag }));

  return {
    results: list.items,
    page: list.page,
    pageSize: list.pageSize,
    total: list.total,
    nextHref: list.nextHref,
    prevHref: list.prevHref,
    relatedCategories,
    relatedTags,
  };
}

export async function getSuggestions(searchQuery: string) {
  const needle = searchQuery.trim().toLowerCase();
  const matches = (value: string) =>
    !needle || value.toLowerCase().includes(needle);

  return {
    trending: [
      "fitness",
      "beach",
      "travel",
      "gym workout",
      "road trip",
    ].filter(matches),
    tags: tags
      .filter((tag) => matches(tag.name) || matches(tag.slug))
      .slice(0, 6)
      .map((tag) => ({ ...tag })),
    categories: categories
      .filter((category) => matches(category.name) || matches(category.slug))
      .slice(0, 5)
      .map((category) => ({ ...category })),
    videos: visibleVideos()
      .filter((video) => matches(video.title))
      .slice(0, 5),
  };
}

export async function getWatch(slug: string) {
  const video = videos.find((item) => item.slug === slug);
  if (!video) return null;

  const category = categoryForVideo(video);
  const videoTags = tagsForVideo(video);
  const available = visibleVideos().filter((item) => item.id !== video.id);
  const sameCategory = available.filter(
    (item) => categoryForVideo(item).slug === category.slug,
  );
  const related = [
    ...sameCategory,
    ...available.filter(
      (item) => !sameCategory.some((same) => same.id === item.id),
    ),
  ].slice(0, 8);

  const page: VideoPage = {
    ...video,
    description:
      "A neutral fixture description for page development and responsive layout testing.",
    category: { slug: category.slug, name: category.name },
    tags: videoTags.map((tag) => ({ slug: tag.slug, name: tag.name })),
    likes: Math.max(0, Math.round(video.views * 0.012)),
    upNext: available.slice(0, 8),
    related,
    popularNow: sortMostViewed(available).slice(0, 5),
  };

  const mirrors: MirrorPublic[] = [
    {
      hostId: "dood",
      label: "Server 1",
      embedUrl: `https://example.com/embed/dood/${video.id}`,
    },
    {
      hostId: "voe",
      label: "Server 2",
      embedUrl: `https://example.com/embed/voe/${video.id}`,
    },
    {
      hostId: "earnvids",
      label: "Server 3",
      embedUrl: `https://example.com/embed/earnvids/${video.id}`,
    },
  ];

  return { video: page, mirrors };
}

export async function getPopularTags(): Promise<Tag[]> {
  return [...tags]
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((tag) => ({ ...tag }));
}
