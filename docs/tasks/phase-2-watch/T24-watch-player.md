# T24 — Watch page and player

## Prerequisite
Phase 1 merged.

## Attach
Boards 1d, 1h, 1k, 2j, 2v.

## Creates
- `app/(public)/watch/[slug]/**`
- existing `middleware.ts`, but only the minimal Watch-specific change required to return a true HTTP 410 for REMOVED videos; preserve all T11 age-gate behavior.

Keep page, player, loading, metadata, and route-local CSS/components inside the Watch route directory unless the middleware exception above is required.

## Implement
- Poster with Play button; mount first OK mirror iframe only after Play.
- Server 1/2/3 switcher + “Not playing? Try another server”.
- Loading state until iframe `onLoad`.
- Count one view on first Play.
- REMOVED renders the supplied removed state and returns a true HTTP 410; do not fake this as a 200 response. Preserve the visible requested URL.
- PROCESSING/BLOCKED/FAILED neutral wrapper states.
- Age-restricted state.
- Draft/hidden: 404.
- Actions: Like, Save(localStorage), Share, Report.
- Tags, description, Up Next, More like this, Popular, Related tags.
- `VideoObject` JSON-LD.

## Done when
- Player and all availability states match boards.


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
