"use client";

import { useState } from "react";

import { BottomSheet } from "@/components/feedback/BottomSheet";
import { Button, Icon } from "@/components/primitives";

import {
  countActiveFilters,
  dateOptions,
  durationOptions,
  navigateWithFilters,
  sortOptions,
  type FilterKey,
  type FilterOption,
  type FilterState,
} from "./FilterToolbar";
import styles from "./FilterBottomSheet.module.css";

export type FilterBottomSheetProps = {
  values?: FilterState;
  categories?: readonly FilterOption[];
  tags?: readonly FilterOption[];
  defaultSort?: string;
  className?: string;
};

type GroupVariant = "chips" | "segmented" | "rows";

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function FilterGroup({
  title,
  name,
  value,
  options,
  variant,
  onChange,
}: {
  title: string;
  name: FilterKey;
  value?: string;
  options: readonly FilterOption[];
  variant: GroupVariant;
  onChange: (key: FilterKey, value: string) => void;
}) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{title}</legend>
      <div
        className={joinClasses(
          styles.options,
          variant === "chips" && styles.chipOptions,
          variant === "segmented" && styles.segmentedOptions,
          variant === "rows" && styles.rowOptions,
        )}
      >
        {options.map((option) => {
          const id = `gv-filter-${name}-${option.value || "all"}`;
          const checked = (value ?? "") === option.value;

          return (
            <label
              key={option.value || "all"}
              htmlFor={id}
              className={joinClasses(
                styles.option,
                variant === "chips" && styles.chip,
                variant === "segmented" && styles.segment,
                variant === "rows" && styles.row,
                checked && styles.optionSelected,
              )}
            >
              <input
                id={id}
                className={styles.radio}
                type="radio"
                name={`draft-${name}`}
                value={option.value}
                checked={checked}
                onChange={() => onChange(name, option.value)}
              />

              {variant === "rows" ? (
                <>
                  <span className={styles.optionLabel}>{option.label}</span>
                  <span
                    className={joinClasses(
                      styles.radioMark,
                      checked && styles.radioMarkSelected,
                    )}
                    aria-hidden="true"
                  />
                </>
              ) : (
                <>
                  {checked && variant === "chips" ? (
                    <Icon name="check" className={styles.check} />
                  ) : null}
                  <span className={styles.optionLabel}>{option.label}</span>
                </>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FilterBottomSheet({
  values = {},
  categories = [],
  tags = [],
  defaultSort = "newest",
  className,
}: FilterBottomSheetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterState>(values);
  const activeCount = countActiveFilters(values);
  const draftCount = countActiveFilters(draft);

  const openSheet = () => {
    setDraft({ ...values, sort: values.sort ?? defaultSort });
    setOpen(true);
  };

  const updateDraft = (key: FilterKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const resetDraft = () => {
    setDraft({
      category: "",
      duration: "",
      date: "",
      tag: "",
      sort: defaultSort,
    });
  };

  const applyDraft = () => {
    navigateWithFilters({
      category: draft.category ?? "",
      duration: draft.duration ?? "",
      date: draft.date ?? "",
      tag: draft.tag ?? "",
      sort: draft.sort === defaultSort ? "" : (draft.sort ?? ""),
    });
  };

  return (
    <div className={joinClasses(styles.root, className)}>
      <button
        type="button"
        className={joinClasses(
          styles.trigger,
          activeCount > 0 && styles.triggerActive,
        )}
        onClick={openSheet}
      >
        <Icon name="tune" className={styles.triggerIcon} />
        <span>
          Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
        </span>
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Filters${draftCount > 0 ? ` · ${draftCount}` : ""}`}
        actions={
          <>
            <div className={styles.secondaryActions}>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="secondary" size="md" onClick={resetDraft}>
                Reset
              </Button>
            </div>
            <Button size="lg" onClick={applyDraft}>
              Apply Filters
            </Button>
          </>
        }
      >
        <div className={styles.body}>
          {categories.length > 0 ? (
            <FilterGroup
              title="Category"
              name="category"
              value={draft.category}
              options={[{ value: "", label: "All" }, ...categories]}
              variant="chips"
              onChange={updateDraft}
            />
          ) : null}

          <FilterGroup
            title="Duration"
            name="duration"
            value={draft.duration}
            options={durationOptions}
            variant="chips"
            onChange={updateDraft}
          />

          <FilterGroup
            title="Upload date"
            name="date"
            value={draft.date}
            options={dateOptions}
            variant="segmented"
            onChange={updateDraft}
          />

          {tags.length > 0 ? (
            <FilterGroup
              title="Tags"
              name="tag"
              value={draft.tag}
              options={[{ value: "", label: "Any" }, ...tags]}
              variant="chips"
              onChange={updateDraft}
            />
          ) : null}

          <FilterGroup
            title="Sort by"
            name="sort"
            value={draft.sort ?? defaultSort}
            options={sortOptions}
            variant="rows"
            onChange={updateDraft}
          />
        </div>
      </BottomSheet>
    </div>
  );
}
