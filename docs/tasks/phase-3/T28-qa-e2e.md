# T28 — QA and end-to-end tests

## Prerequisite
T20–T27 merged.

## Creates
- `playwright.config.ts`
- `tests/e2e/**`
- `docs/QA.md`
- existing `.github/workflows/ci.yml`, only to add deterministic database seed/setup, browser install and Playwright E2E gates
- existing `prisma/seed.ts`, only when deterministic E2E records are missing
- existing **non-locked** app/component/lib files only when necessary to fix a defect proven by T28 E2E, responsive or accessibility checks

T28 is the integration/QA task: it may fix discovered implementation defects, but it must not redesign the product or change 🔒 contracts/schema. A required locked-contract change remains a blocker and must be reported.

## Implement
Playwright E2E:
- Desktop: age gate → home → search → results → watch → switch server → related → category → filter → Hot → home.
- Mobile path.
- Report flow.
- Load More with server-pagination fallback.
- Admin approve.
- Manual mirror link.
- Change primary host.
- Verify REMOVED/BLOCKED Watch responses return 410 and draft/hidden return 404.

Responsive/accessibility:
- widths 1440, 1280, 1024, 768, 390, 375, 360, 320.
- no horizontal overflow.
- 1-column grid below 340px.
- axe-core: no serious issues.
- keyboard/focus flows for search, dialogs, report and age gate.

GitHub Actions E2E gate:
- PostgreSQL migrated and deterministically seeded before the app starts.
- Install the required Playwright browser/dependencies in CI.
- Start the production build (or configured Playwright webServer), run E2E, preserve useful failure traces/screenshots, then clean up.
- If QA exposes a bug in an allowed non-locked file, fix it in this T28 branch and rerun CI rather than stopping only because the original QA file list was narrow.

## Done when
- Unit/lint/type/build checks are green.
- E2E suite passes in GitHub Actions.
- Documented responsive/a11y checks pass.
- No serious axe findings or known route/status regressions remain.
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
