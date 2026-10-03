# T18 — Matching queue, categories, tags

## Prerequisite
T17 merged.

## Creates
- `app/admin/matching/*`
- `app/admin/categories/*`
- `app/admin/tags/*`

## Implement
- Matching queue for unmatched secondary-host files including duplicate names.
- Suggested videos with one-click Link or Ignore.
- Categories CRUD: group, sort order, image, trending.
- Tags CRUD + merge.
- zod server actions + audit rows.

## Done when
- Matching and taxonomy administration are complete.


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
- Commit message must be `T18: <task title>`.
