"use client";

import { useMemo, useState } from "react";

import { CategoryCard } from "@/components/cards/CategoryCard";
import { Icon } from "@/components/primitives";
import type { Category } from "@/lib/types";

import styles from "./page.module.css";

type Props = {
  categories: Category[];
};

export function CategoryBrowser({ categories }: Props) {
  const groups = useMemo(
    () => Array.from(new Set(categories.map((category) => category.group))),
    [categories],
  );
  const [group, setGroup] = useState("All");
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const matches = categories.filter((category) =>
    category.name.toLowerCase().includes(normalizedQuery),
  );

  const popular = [...matches]
    .sort(
      (a, b) =>
        Number(Boolean(b.trending)) - Number(Boolean(a.trending)) ||
        b.count - a.count ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 6);

  const visibleGroups =
    group === "All"
      ? groups
      : group === "Popular"
        ? []
        : groups.filter((item) => item === group);

  return (
    <>
      <div className={styles.browserTools}>
        <div className={styles.groupTabs} role="tablist" aria-label="Category groups">
          {["All", "Popular", ...groups].map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={group === item}
              className={group === item ? styles.activeTab : styles.groupTab}
              onClick={() => setGroup(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <label className={styles.searchBox}>
          <Icon name="search" className={styles.searchIcon} />
          <span className={styles.srOnly}>Filter categories</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Filter categories"
          />
        </label>
      </div>

      {group === "All" || group === "Popular" ? (
        <section className={styles.categorySection}>
          <div className={styles.sectionHeading}>
            <h2>Popular</h2>
          </div>
          <div className={styles.categoryGrid}>
            {popular.map((category, index) => (
              <CategoryCard
                key={category.slug}
                category={category}
                variant={category.trending ? "trending" : "wide"}
                priority={index < 3}
              />
            ))}
          </div>
        </section>
      ) : null}

      {visibleGroups.map((groupName) => {
        const groupCategories = matches.filter(
          (category) => category.group === groupName,
        );
        if (!groupCategories.length) return null;

        return (
          <section className={styles.categorySection} key={groupName}>
            <div className={styles.sectionHeading}>
              <div>
                <h2>{groupName}</h2>
                <span>{groupCategories.length} categories</span>
              </div>
            </div>
            <div className={styles.categoryGrid}>
              {groupCategories.map((category) => (
                <CategoryCard
                  key={category.slug}
                  category={category}
                  variant="wide"
                />
              ))}
            </div>
          </section>
        );
      })}

      {!matches.length ? (
        <section className={styles.noMatches}>
          <Icon name="search_off" />
          <h2>No categories match that filter</h2>
          <button type="button" onClick={() => setQuery("")}>
            Clear filter
          </button>
        </section>
      ) : null}
    </>
  );
}
