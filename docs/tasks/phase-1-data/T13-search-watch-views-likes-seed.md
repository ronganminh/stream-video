# T13 — Search, watch, views, likes, seed

## Prerequisite
T12 merged.

## Creates
- `lib/data/prisma/search.ts`
- `lib/data/prisma/watch.ts`
- `app/api/videos/[id]/view/route.ts`
- `app/api/videos/[id]/like/route.ts`
- `prisma/seed.ts`

## Implement
- Search: full-text + trigram similarity over title, tags, category, with filters.
- `getWatch`: OK mirrors ordered by Host.sortOrder, plus Up Next, Related, Popular.
- View API: max one view per cookie per 6h and increment `VideoDailyStat`.
- Like API: cookie-limited.
- Seed fixtures, create three hosts, with Dood initially primary, plus fake mirrors.
- Do not hardcode Dood as permanent primary in application logic.

## Done when
- Search/watch APIs work against Prisma seed data.


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
- Commit message must be `T13: <task title>`.
