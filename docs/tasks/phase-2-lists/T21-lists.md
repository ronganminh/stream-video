# T21 — Hot, Most Viewed, Latest

## Prerequisite
T20 merged.

## Attach
Boards 2a, 2b, 2c, 2n, 2o, 2p, 2q, 3b plus Handoff SEO/pagination/ad rules.

## Creates
- `app/(public)/hot/**`
- `app/(public)/most-viewed/**`
- `app/(public)/latest/**`

Keep page, loading, metadata exports and route-local CSS/components inside those directories.

## Implement
- Every `?page=n` is directly SSR with full content, a Page-n title and self-canonical URL; real Prev/page-number/Next links remain in HTML without JS.
- Hot: top 5 RankCards and window handling.
- Most Viewed: “#1 MOST WATCHED” badge + supplied empty state.
- Latest: group initial content into “Last hour” and “Earlier today”.
- Non-default windows, sorting and filters are `noindex,follow` and canonical to the unfiltered list.
- Use existing FilterToolbar/Pagination/LoadMore without removing the server pager fallback.
- Use T19 `list-in-feed` / mobile ad data only where the boards/Handoff place it; no-fill collapses.
- Add BreadcrumbList structured data where the Handoff requires breadcrumbs.
- Loading/error/empty states follow the supplied skeleton and recovery states.

## Done when
- All three pages match boards.
- SSR pagination works with JS disabled.
- Filtered/window variants have correct index/canonical behavior.
- Load More does not remove the underlying crawlable pager.

## GitHub delivery workflow
- Start from the latest `main` after all listed prerequisites are merged. Work on a `task/Txx-<short-name>` branch.
- After implementation, run the task-specific **Done when** checks that are possible in the task environment, then commit/push and open a PR to `main`.
- Inspect the GitHub Actions run for the PR/head commit yourself.
- If CI fails, read the failed job, failed step, and job logs; fix only files allowed by **Creates**, commit/push, and inspect the new Actions run. Repeat until green.
- If a required fix would touch a file outside **Creates** or a locked 🔒 contract not explicitly allowed here, stop and report the blocker instead of changing scope.
- CI green is mandatory but does not replace task-specific checks that CI cannot cover (for example visual comparison, Docker migration, E2E, or VPS deployment).
- When CI is green and **Done when** passes, squash-merge the PR into `main`.
- Do not ask the user to run CI, Desktop Commander, or paste CI logs when GitHub tools are available.

## Rules for this chat
- Work on exactly this task only.
- Read the current repository first.
- Modify/create only files listed under **Creates**.
- Do not modify 🔒 contract files unless this task explicitly allows it.
- Return complete files, not diffs.
- Server Components by default; use "use client" only when interaction requires it.
- Accessibility: visible focus ring using `var(--gv-focus)`, aria-labels for icon buttons, keyboard support, reduced-motion support.
- Use CSS Modules and existing `--gv-*` tokens only. No Tailwind or UI libraries.
- All product UI copy is English.
- Commit message must be `T21: <task title>`.
