# T22 — Categories and Tag pages

## Prerequisite
Phase 1 merged.

## Attach
Boards 2d, 2e, 2f, 2r, 2s, 3a.

## Creates
Route files for:
- `/categories`
- `/category/[slug]`
- `/tag/[slug]`
including loading states and metadata.

## Implement
- SSR pagination.
- Match category/tag layouts exactly.
- Tag page is `noindex` when it has fewer than 5 videos.
- Use existing data contracts/components only.

## Done when
- Routes match boards and handle empty/loading states.


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
- Commit message must be `T22: <task title>`.
