# T26 — Legal pages and forms

## Prerequisite
Phase 1 merged.

## Attach
Boards 2k, 2l, 2x and Handoff route metadata/form states.

## Creates
- `app/(public)/content-removal/**`
- `app/(public)/privacy/**`
- `app/(public)/terms/**`
- `app/(public)/cookies/**`
- `app/api/requests/route.ts`

Keep route-local loading, form, metadata and CSS files inside those directories.

## Implement
- Narrow reading column + section navigation.
- Every legal passage is exactly a placeholder block labelled `LEGAL COPY — FINAL TEXT REQUIRED`; do not write compliance claims.
- `/content-removal`, `/privacy`, `/terms`, `/cookies` use the Handoff indexing rules.
- `/content-removal/dmca` and `/content-removal/request` are `noindex`.
- Forms have labelled fields, inline validation, an error summary, submitting disabled state, network error handling and success state.
- Mobile form submit remains sticky as designed.
- Accept the carried video/page URL from T25 query parameters and prefill/attach it without treating it as trusted HTML.
- `app/api/requests/route.ts` validates input and writes the appropriate DMCA/REMOVAL `RemovalRequest`.

## Done when
- Pages match boards and all legal prose remains the required placeholder.
- Forms submit correctly across validation/error/success states.
- Copyright/privacy handoffs from Watch preserve the originating URL.
- Route index/noindex metadata matches the Handoff.

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
- Commit message must be `T26: <task title>`.
