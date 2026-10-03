# T24 — Watch page and player

## Prerequisite
Phase 1 merged, including T13 watch data and T11 age-gate behavior.

## Attach
Boards 1d, 1h, 1k, 2j, 2v plus Handoff availability/SEO/ad rules.

## Creates
- `app/(public)/watch/[slug]/**`
- `app/(public)/watch/_gone/**`, internal renderer used only for true 410 responses
- existing `middleware.ts`, only for the minimal Watch-specific status rewrite; preserve all T11 age-gate/cookie behavior

Keep page, player, loading, metadata and route-local CSS/components inside the Watch directories unless the middleware exception above is required.

## Implement
- Poster with Play button; mount the first OK mirror iframe only after Play.
- Server 1/2/3 switcher ordered by data-layer `Host.sortOrder`, plus “Not playing? Try another server”.
- Loading state until iframe `onLoad`; count one view only on first Play.
- Availability HTTP behavior must match the Handoff:
  - AVAILABLE: player, HTTP 200, indexed.
  - PROCESSING: neutral processing state, HTTP 200, `noindex`.
  - REMOVED: neutral removed state with related + Hot, HTTP 410.
  - BLOCKED: same neutral removed treatment, never expose internal reason, HTTP 410.
  - AGE_RESTRICTED: age-restricted player state / age-gate actions, HTTP 200.
  - FAILED: unavailable + Play next video, HTTP 200, `noindex`.
  - REGION_RESTRICTED: only if supported by product data; optional 451 behavior from Handoff.
  - Draft/hidden: real 404.
- Next App Router pages cannot simply choose an arbitrary status from `page.tsx`. For 410 states, use middleware to **rewrite** to the internal `/watch/_gone` renderer with status 410 while preserving the requested visible URL; do not return an HTML body directly from middleware.
- Actions: Like, Save(localStorage), Share and a Report trigger that T25 will complete.
- Tags, description, Up Next, More like this, Popular and Related tags.
- Add `VideoObject` JSON-LD for the available Watch page with Handoff fields.
- Use T19 `watch-below-player` and `watch-sidebar` ad data where designed; no-fill collapses.

## Done when
- Player and all supplied availability states match boards.
- REMOVED/BLOCKED requests return a verified HTTP 410 while preserving the original Watch URL.
- Draft/hidden returns 404; PROCESSING/FAILED are 200 noindex.
- Switching servers never depends on which host is primary.

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
- Commit message must be `T24: <task title>`.
