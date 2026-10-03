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
