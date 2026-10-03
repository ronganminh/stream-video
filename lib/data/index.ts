import type {
  Category,
  ListPage,
  ListQuery,
  SearchResult,
  Tag,
} from "../types";
import {
  getCategoriesPrisma,
  getCategoryPrisma,
  getPopularTagsPrisma,
  getTagPrisma,
} from "./prisma/categories";
import { getHomePrisma } from "./prisma/home";
import {
  getHotPrisma,
  getLatestPrisma,
  getMostViewedPrisma,
} from "./prisma/lists";
import {
  getSuggestionsPrisma,
  searchPrisma,
} from "./prisma/search";
import { getWatchPrisma } from "./prisma/watch";

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
  return searchPrisma(searchQuery, query);
}

export async function getSuggestions(searchQuery: string) {
  return getSuggestionsPrisma(searchQuery);
}

export async function getWatch(slug: string) {
  return getWatchPrisma(slug);
}

export async function getPopularTags(): Promise<Tag[]> {
  return getPopularTagsPrisma();
}
