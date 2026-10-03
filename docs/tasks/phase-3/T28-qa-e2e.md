# T28 — QA and end-to-end tests

## Prerequisite
T20–T27 merged.

## Creates
- `playwright.config.ts`
- `tests/e2e/**`
- `docs/QA.md`
- existing `.github/workflows/ci.yml`, only to add the services/setup and Playwright E2E gate required by this task

## Implement
Playwright E2E:
- Desktop: age gate → home → search → results → watch → switch server → related → category → filter → Hot → home.
- Mobile path.
- Report flow.
- Load More.
- Admin approve.
- Manual mirror link.
- Change primary host.

Responsive/accessibility:
- widths 1440, 1280, 1024, 768, 390, 375, 360, 320.
- no horizontal overflow.
- 1-column grid below 340px.
- axe-core: no serious issues.

## Done when
- E2E suite passes in GitHub Actions.
- Documented responsive/a11y checks pass.
- The PR's final GitHub Actions run is green before merge.


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
- Commit message must be `T28: <task title>`.
