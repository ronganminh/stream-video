# T06 — CompactVideoCard, CategoryCard, Skeleton, EmptyState

## Prerequisite
T05 merged.

## Attach
Boards 1d, 1h, 1j, 1m, 2n, 3b.

## Creates
- CompactVideoCard under `components/cards`
- CategoryCard under `components/cards`
- Skeleton under `components/feedback`
- EmptyState / ErrorState under `components/feedback`
- Their CSS modules

## Implement
- CompactVideoCard variants: sidebar, up-next, up-next-featured, ranked.
- CategoryCard variants: tall 4:5, wide 16:10, mobile 16:9, trending; clamp name to 2 lines.
- Skeleton shapes: card, rank, search-row, sidebar, text.
- EmptyState / ErrorState with icon, title, body, actions.

## Done when
- Matches supplied boards at desktop/mobile breakpoints.


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
- Commit message must be `T06: <task title>`.
