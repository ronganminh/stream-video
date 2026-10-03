"use client";

import { Icon } from "@/components/primitives";

import styles from "./FilterToolbar.module.css";

export type FilterKey = "category" | "duration" | "date" | "tag" | "sort";

export type FilterOption = {
  value: string;
  label: string;
};

export type FilterState = Partial<Record<FilterKey, string>>;

export const durationOptions: readonly FilterOption[] = [
  { value: "", label: "Any" },
  { value: "under-5", label: "Under 5 min" },
  { value: "5-15", label: "5–15 min" },
  { value: "15-30", label: "15–30 min" },
  { value: "30-plus", label: "30+ min" },
];

export const dateOptions: readonly FilterOption[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "", label: "All Time" },
];

export const sortOptions: readonly FilterOption[] = [
  { value: "trending", label: "Trending" },
  { value: "most-viewed", label: "Most Viewed" },
  { value: "newest", label: "Newest" },
  { value: "longest", label: "Longest" },
];

export type FilterToolbarProps = {
  values?: FilterState;
  categories?: readonly FilterOption[];
  tags?: readonly FilterOption[];
  defaultSort?: string;
  className?: string;
};

const ACTIVE_FILTER_KEYS: readonly FilterKey[] = [
  "category",
  "duration",
  "date",
  "tag",
];

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function countActiveFilters(values: FilterState = {}) {
  return ACTIVE_FILTER_KEYS.reduce(
    (count, key) => count + (values[key] ? 1 : 0),
    0,
  );
}

export function navigateWithFilters(patch: FilterState) {
  const url = new URL(window.location.href);

  for (const [key, value] of Object.entries(patch)) {
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  }

  url.searchParams.delete("page");
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
}

function FilterSelect({
  label,
  name,
  value,
  options,
  defaultValue,
}: {
  label: string;
  name: FilterKey;
  value?: string;
  options: readonly FilterOption[];
  defaultValue?: string;
}) {
  return (
    <label className={styles.selectShell}>
      <span className={styles.selectLabel}>{label}:</span>
      <select
        className={styles.select}
        aria-label={label}
        name={name}
        value={value ?? defaultValue ?? ""}
        onChange={(event) => {
          const selected = event.currentTarget.value;
          navigateWithFilters({
            [name]: selected === defaultValue ? "" : selected,
          });
        }}
      >
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="expand_more" className={styles.chevron} />
    </label>
  );
}

export function FilterToolbar({
  values = {},
  categories = [],
  tags = [],
  defaultSort = "newest",
  className,
}: FilterToolbarProps) {
  const activeCount = countActiveFilters(values);

  const clearFilters = () => {
    navigateWithFilters({
      category: "",
      duration: "",
      date: "",
      tag: "",
    });
  };

  return (
    <div className={joinClasses(styles.toolbar, className)}>
      <span className={styles.filterCount}>
        Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
      </span>

      {categories.length > 0 ? (
        <FilterSelect
          label="Category"
          name="category"
          value={values.category}
          options={[{ value: "", label: "All" }, ...categories]}
        />
      ) : null}

      <FilterSelect
        label="Duration"
        name="duration"
        value={values.duration}
        options={durationOptions}
      />

      <FilterSelect
        label="Upload date"
        name="date"
        value={values.date}
        options={dateOptions}
      />

      {tags.length > 0 ? (
        <FilterSelect
          label="Tags"
          name="tag"
          value={values.tag}
          options={[{ value: "", label: "Any" }, ...tags]}
        />
      ) : null}

      <FilterSelect
        label="Sort"
        name="sort"
        value={values.sort}
        defaultValue={defaultSort}
        options={sortOptions}
      />

      {activeCount > 0 ? (
        <button type="button" className={styles.clear} onClick={clearFilters}>
          Clear
        </button>
      ) : null}
    </div>
  );
}
