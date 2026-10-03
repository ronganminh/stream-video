"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";

import styles from "./Tabs.module.css";

export type TabItem = {
  id: string;
  label: string;
  disabled?: boolean;
};

export type TabsProps = {
  items: readonly TabItem[];
  variant?: "segmented" | "underline";
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  ariaLabel: string;
  className?: string;
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Tabs({
  items,
  variant = "segmented",
  value,
  defaultValue,
  onValueChange,
  ariaLabel,
  className,
}: TabsProps) {
  const firstEnabled = items.find((item) => !item.disabled)?.id ?? "";
  const [internalValue, setInternalValue] = useState(
    defaultValue ?? firstEnabled,
  );
  const activeValue = value ?? internalValue;

  const select = (nextValue: string) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    const tablist = event.currentTarget.parentElement;
    if (!tablist) return;

    const tabs = Array.from(
      tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    if (tabs.length === 0) return;

    event.preventDefault();

    const currentIndex = tabs.indexOf(event.currentTarget);
    let nextIndex = currentIndex;

    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    }

    const nextTab = tabs[nextIndex];
    nextTab.focus();
    const nextValue = nextTab.dataset.tabValue;
    if (nextValue) select(nextValue);
  };

  return (
    <div
      className={joinClasses(styles.tabs, styles[variant], className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const active = item.id === activeValue;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={joinClasses(styles.tab, active ? styles.active : undefined)}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            data-tab-value={item.id}
            onClick={() => select(item.id)}
            onKeyDown={onKeyDown}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
