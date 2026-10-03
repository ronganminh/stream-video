"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

import { Icon } from "@/components/primitives";

import {
  buildKeyboardOptions,
  SearchSuggestions,
} from "./SearchSuggestions";
import type { SuggestionData, SuggestionOption } from "./SearchSuggestions";
import styles from "./SearchBox.module.css";

const RECENT_KEY = "gv-recent-searches";
const MAX_RECENT = 5;
const EMPTY_DATA: SuggestionData = {
  trending: [],
  tags: [],
  categories: [],
  videos: [],
};

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

function writeRecent(values: string[]) {
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(values.slice(0, MAX_RECENT)));
}

export function SearchBox() {
  const router = useRouter();
  const listboxId = `search-suggestions-${useId().replace(/:/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SuggestionData>(EMPTY_DATA);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  const options = useMemo(() => buildKeyboardOptions(data, recent, query, "desktop"), [data, recent, query]);
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  useEffect(() => {
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      if (!window.matchMedia("(min-width: 768px)").matches) return;
      event.preventDefault();
      inputRef.current?.focus();
      setOpen(true);
    };

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const loadingTimer = window.setTimeout(() => setLoading(true), 150);
    const requestTimer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Search suggestions failed");
        const next = (await response.json()) as SuggestionData;
        setData(next);
        setActiveIndex(-1);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setData(EMPTY_DATA);
        }
      } finally {
        window.clearTimeout(loadingTimer);
        setLoading(false);
      }
    }, 90);

    return () => {
      controller.abort();
      window.clearTimeout(requestTimer);
      window.clearTimeout(loadingTimer);
    };
  }, [open, query]);

  const remember = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    setRecent((current) => {
      const next = [clean, ...current.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT);
      writeRecent(next);
      return next;
    });
  };

  const goTo = (option: SuggestionOption) => {
    if (option.kind === "recent" || option.kind === "trending") remember(option.label);
    setOpen(false);
    setActiveIndex(-1);
    router.push(option.href);
  };

  const submitQuery = () => {
    const clean = query.trim();
    if (!clean) return;
    remember(clean);
    setOpen(false);
    setActiveIndex(-1);
    router.push(`/search?q=${encodeURIComponent(clean)}`);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeOption) goTo(activeOption);
    else submitQuery();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      if (options.length > 0) setActiveIndex((current) => (current + 1) % options.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      if (options.length > 0) {
        setActiveIndex((current) => (current <= 0 ? options.length - 1 : current - 1));
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const removeRecent = (value: string) => {
    setRecent((current) => {
      const next = current.filter((item) => item !== value);
      writeRecent(next);
      return next;
    });
  };

  const clearRecent = () => {
    setRecent([]);
    writeRecent([]);
  };

  return (
    <div ref={rootRef} className={styles.root}>
      <form className={styles.form} role="search" onSubmit={onSubmit}>
        <Icon name={loading ? "progress_activity" : "search"} className={loading ? styles.loadingIcon : styles.searchIcon} />
        <input
          ref={inputRef}
          type="search"
          className={styles.input}
          placeholder="Search videos, categories or tags"
          value={query}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeOption?.id}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className={styles.clearButton}
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
          >
            <Icon name="close" className={styles.clearIcon} />
          </button>
        ) : null}
        <span className={styles.shortcut} aria-hidden="true">{open ? "esc" : "/"}</span>
      </form>

      {open ? (
        <>
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Close search suggestions"
            tabIndex={-1}
            onClick={() => {
              setOpen(false);
              setActiveIndex(-1);
            }}
          />
          <SearchSuggestions
            id={listboxId}
            query={query}
            data={data}
            recent={recent}
            activeId={activeOption?.id}
            onSelect={goTo}
            onRemoveRecent={removeRecent}
            onClearRecent={clearRecent}
          />
        </>
      ) : null}
    </div>
  );
}
