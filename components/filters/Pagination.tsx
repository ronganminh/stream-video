import Link from "next/link";

import { Icon } from "@/components/primitives";

import styles from "./Pagination.module.css";

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean)[];

export type PaginationProps = {
  page: number;
  totalPages: number;
  basePath: string;
  query?: Readonly<Record<string, QueryValue>>;
  id?: string;
  className?: string;
};

type PagerItem = number | "ellipsis";

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function pageItems(page: number, totalPages: number): PagerItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }

  if (page >= totalPages - 3) {
    return [
      1,
      "ellipsis",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "ellipsis",
    page - 1,
    page,
    page + 1,
    "ellipsis",
    totalPages,
  ];
}

function hrefForPage(
  basePath: string,
  query: PaginationProps["query"],
  page: number,
) {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(query ?? {})) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      continue;
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    for (const value of values) {
      params.append(key, String(value));
    }
  }

  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

export function Pagination({
  page,
  totalPages,
  basePath,
  query,
  id = "list-pagination",
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const currentPage = Math.min(Math.max(1, page), totalPages);
  const items = pageItems(currentPage, totalPages);

  return (
    <nav
      className={joinClasses(styles.pagination, className)}
      aria-label="Pagination"
      data-gv-pagination={id}
    >
      {currentPage > 1 ? (
        <Link
          href={hrefForPage(basePath, query, currentPage - 1)}
          className={styles.direction}
          rel="prev"
        >
          <Icon name="chevron_left" className={styles.directionIcon} />
          Previous
        </Link>
      ) : (
        <span className={joinClasses(styles.direction, styles.disabled)}>
          <Icon name="chevron_left" className={styles.directionIcon} />
          Previous
        </span>
      )}

      <div className={styles.pages}>
        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className={styles.ellipsis}
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <Link
              key={item}
              href={hrefForPage(basePath, query, item)}
              className={joinClasses(
                styles.page,
                item === currentPage && styles.active,
              )}
              aria-current={item === currentPage ? "page" : undefined}
            >
              {item}
            </Link>
          ),
        )}
      </div>

      {currentPage < totalPages ? (
        <Link
          href={hrefForPage(basePath, query, currentPage + 1)}
          className={styles.direction}
          rel="next"
        >
          Next
          <Icon name="chevron_right" className={styles.directionIcon} />
        </Link>
      ) : (
        <span className={joinClasses(styles.direction, styles.disabled)}>
          Next
          <Icon name="chevron_right" className={styles.directionIcon} />
        </span>
      )}
    </nav>
  );
}
