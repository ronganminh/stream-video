import { getCategoriesPrisma, getPopularTagsPrisma } from "./categories";
import { getHotPrisma, getLatestPrisma, getMostViewedPrisma } from "./lists";

export async function getHomePrisma() {
  const [trendingPage, hotPage, popularCategories, latest, popularTags] = await Promise.all([
    getMostViewedPrisma({ window: "all", page: 1 }),
    getHotPrisma({ window: "today", page: 1 }),
    getCategoriesPrisma(),
    getLatestPrisma({ page: 1 }),
    getPopularTagsPrisma(),
  ]);

  return {
    trending: trendingPage.items.slice(0, 5),
    hot: hotPage.items.slice(0, 10),
    popularCategories: [...popularCategories]
      .sort(
        (a, b) =>
          Number(Boolean(b.trending)) - Number(Boolean(a.trending)) ||
          b.count - a.count ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 6),
    latest,
    popularTags,
  };
}
