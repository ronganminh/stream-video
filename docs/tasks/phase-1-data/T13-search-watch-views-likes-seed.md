# T13 — Search, watch, views, likes, seed

## Prerequisite
T12 merged.

## Creates
- `lib/data/prisma/search.ts`
- `lib/data/prisma/watch.ts`
- existing `lib/data/index.ts`, signature-preserving implementation swap only
- `app/api/videos/[id]/view/route.ts`
- `app/api/videos/[id]/like/route.ts`
- `prisma/seed.ts`

## Implement
- Search: full-text + trigram similarity over title, tags and category, with filters and the shared public visibility rule.
- Implement Prisma-backed suggestions for the existing `getSuggestions` signature: trending terms, tags, categories and matching **publicly visible** videos.
- Implement `getWatch` with OK mirrors ordered by `Host.sortOrder`, plus Up Next, Related and Popular.
- Direct Watch lookup must support the later T24 wrapper states for a known published, non-hidden slug: AVAILABLE, PROCESSING, REMOVED, BLOCKED, AGE_RESTRICTED, REGION_RESTRICTED and FAILED. Draft/hidden videos still resolve as not found. Do not expose unavailable videos in listing/search results.
- Update `lib/data/index.ts` so `search`, `getSuggestions`, `getWatch` and `getPopularTags` no longer fall back to fixtures in production data access. Do not change any 🔒 signature.
- View API: max one view per cookie per 6h and increment `VideoDailyStat`.
- Like API: cookie-limited.
- Seed fixtures, create the three Host rows with Dood initially primary, plus deterministic fake mirrors/data needed for local development.
- Do not hardcode Dood as permanent primary in application logic.

## Done when
- Search, suggestions and Watch work against Prisma seed data.
- The public data API does not mix fixture-backed search/watch/suggestion/popular-tag results with Prisma listing data.
- Draft/hidden lookup is not exposed; unavailable published states remain available only to the Watch wrapper logic.

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
- Commit message must be `T13: <task title>`.
