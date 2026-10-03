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
import styles from "./MobileSearch.module.css";

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

export function MobileSearch() {
  const router = useRouter();
  const listboxId = `mobile-search-suggestions-${useId().replace(/:/g, "")}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SuggestionData>(EMPTY_DATA);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  const options = useMemo(() => buildKeyboardOptions(data, recent, query, "mobile"), [data, recent, query]);
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  useEffect(() => {
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      if (!window.matchMedia("(max-width: 767px)").matches) return;
      event.preventDefault();
      setOpen(true);
    };

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => inputRef.current?.focus());

    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    window.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
    };
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

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
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

  const onOverlayKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = overlayRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled])',
    );
    if (!focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (options.length > 0) setActiveIndex((current) => (current + 1) % options.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length > 0) {
        setActiveIndex((current) => (current <= 0 ? options.length - 1 : current - 1));
      }
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
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label="Search"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Icon name="search" className={styles.triggerIcon} />
      </button>

      {open ? (
        <div
          ref={overlayRef}
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          data-gv-fullscreen-search="true"
          onKeyDown={onOverlayKeyDown}
        >
          <div className={styles.searchBar}>
            <button type="button" className={styles.backButton} aria-label="Close search" onClick={close}>
              <Icon name="arrow_back" className={styles.backIcon} />
            </button>
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
                aria-expanded="true"
                aria-controls={listboxId}
                aria-activedescendant={activeOption?.id}
                onChange={(event) => {
                  setQuery(event.target.value);
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
                  <span className={styles.clearCircle}>
                    <Icon name="close" className={styles.clearIcon} />
                  </span>
                </button>
              ) : null}
            </form>
          </div>

          <SearchSuggestions
            id={listboxId}
            query={query}
            data={data}
            recent={recent}
            activeId={activeOption?.id}
            variant="mobile"
            onSelect={goTo}
            onRemoveRecent={removeRecent}
            onClearRecent={clearRecent}
          />
        </div>
      ) : null}
    </>
  );
}
