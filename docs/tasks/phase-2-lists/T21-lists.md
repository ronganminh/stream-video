# T21 — Hot, Most Viewed, Latest

## Prerequisite
T20 merged.

## Attach
Boards 2a, 2b, 2c, 2n, 2o, 2p, 2q, 3b.

## Creates
Route files for:
- `/hot`
- `/most-viewed`
- `/latest`
including loading states and metadata.

## Implement
- SSR `?page=n`.
- Hot: top 5 RankCards.
- Most Viewed: “#1 MOST WATCHED” badge + empty state.
- Latest: group into “Last hour” and “Earlier today”.
- Non-default windows/filters: `noindex,follow`.
- JS-off pagination remains functional.

## Done when
- All three pages match boards and SSR pagination works.


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
