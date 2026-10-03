# T12 — Prisma data layer for listings

## Prerequisite
T04 and T03 merged.

## Read first
- `lib/data/index.ts`
- `prisma/schema.prisma`

## Creates
- `lib/data/prisma/visibility.ts`
- `lib/data/prisma/home.ts`
- `lib/data/prisma/lists.ts`
- `lib/data/prisma/categories.ts`
- updated `lib/data/index.ts` (signature-preserving implementation swap only)
- `app/api/list/route.ts`

## Implement
- Shared public visibility filter: published, not hidden, AVAILABLE, at least one OK mirror.
- Hot and Most Viewed aggregate `VideoDailyStat` for today/week/month/all.
- `hotOverride` pins into Hot.
- Prisma implementations for home/hot/most-viewed/latest/categories/category/tag with pagination.
- `/api/list` returns JSON pages for LoadMore.

## Done when
- Existing data API signatures remain unchanged.


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
- Commit message must be `T12: <task title>`.
