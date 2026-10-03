# T02 — Contracts, formatting and fixtures 🔒

## Prerequisite
T01 merged.

## Attach / inspect
- Developer Handoff section: **Page data contracts**

## Creates
- `lib/types.ts` 🔒
- `lib/format.ts` 🔒
- `lib/data/index.ts` 🔒
- `lib/fixtures/videos.ts`
- `lib/fixtures/categories.ts`
- `lib/fixtures/tags.ts`
- `lib/format.test.ts`

## Implement
- Define Handoff contracts exactly: `VideoCard`, `VideoPage`, `ListPage`, `Category`, `Tag`, `Availability`.
- Add `HostId = string`.
- Add `MirrorPublic { hostId, label, embedUrl }`.
- Add `ListQuery { window?, sort?, duration?, date?, category?, page? }`.
- Add `SearchResult`.
- Implement `formatDuration`, `formatViews`, `timeAgo` with Vitest coverage.
- Fixture-backed async data functions: `getHome`, `getHot`, `getMostViewed`, `getLatest`, `getCategories`, `getCategory`, `getTag`, `search`, `getSuggestions`, `getWatch`, `getPopularTags`.
- Fixtures: about 60 videos, 24 categories, 40 tags, including long title, zero views, 12M views, null duration, null thumbnail, 59 sec, 2 hr.

## Done when
- `npm test` passes.


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
- Commit message must be `T02: <task title>`.
