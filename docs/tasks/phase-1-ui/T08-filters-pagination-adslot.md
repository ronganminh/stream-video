# T08 — Filters, Pagination, AdSlot

## Prerequisite
T07 merged.

## Attach
Boards 1n, 2c, 2q, 3b plus Handoff ad and pagination sections.

## Creates
- `components/filters/FilterToolbar.tsx`
- `components/filters/FilterBottomSheet.tsx`
- `components/filters/Pagination.tsx`
- `components/filters/LoadMore.tsx`
- `components/ads/AdSlot.tsx`
- `components/filters/{FilterToolbar,FilterBottomSheet,Pagination,LoadMore}.module.css`
- `components/ads/AdSlot.module.css`

## Implement
- Desktop filters with “Filters · n” and Clear.
- Mobile sheet uses draft state with Cancel / Reset / Apply.
- Filter state lives in URL query.
- Pagination renders real server Prev/Next `?page=n` links.
- LoadMore progressively enhances pagination by fetching `/api/list?...&page=n+1`, rendering skeletons, appending cards and updating count without layout jump.
- AdSlot variants: leaderboard, rectangle, in-feed, mobile. Always label “ADVERTISEMENT”, reserve space, collapse on no fill, HTML via props.

## Done when
- Works with JS off through pagination links.


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
- Commit message must be `T08: <task title>`.
