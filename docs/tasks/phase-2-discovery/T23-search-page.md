# T23 — Search results page

## Prerequisite
T22 merged.

## Attach
Boards 2g, 2h, 2t, 2u.

## Creates
Route files for `/search`, including loading and metadata.

## Implement
- Always `noindex,follow`.
- Search results with filters/pagination.
- Show related categories and tags.
- Show recovery section when no results.
- SSR `?page=n` must work without JS.

## Done when
- Search states match boards.


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
- Commit message must be `T23: <task title>`.
