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
- CSS modules as needed

## Implement
- Desktop filters with “Filters · n” and Clear.
- Mobile sheet uses draft state with Cancel / Reset / Apply.
- Filter state lives in URL query.
- Pagination renders real server Prev/Next `?page=n` links.
- LoadMore progressively enhances pagination by fetching `/api/list?...&page=n+1`, rendering skeletons, appending cards and updating count without layout jump.
- AdSlot variants: leaderboard, rectangle, in-feed, mobile. Always label “ADVERTISEMENT”, reserve space, collapse on no fill, HTML via props.

## Done when
- Works with JS off through pagination links.


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
