# T25 — Report flow

## Prerequisite
T24 merged.

## Attach
Boards 2m, 2w and Handoff report-flow states.

## Creates
- `app/(public)/watch/[slug]/**`, only for integrating the Report action/flow into the existing Watch page
- `app/api/reports/route.ts`
- report-flow files colocated under `app/(public)/watch/[slug]/`

## Implement
- Desktop modal, mobile bottom sheet.
- Steps: reason → details → received.
- Attach current video URL **and timestamp** automatically; details/email optional.
- Person depicted/privacy provides a link to `/content-removal/request`.
- Copyright routes to `/content-removal/dmca` with the current video URL carried over.
- Underage/non-consensual/illegal reasons are labelled “Urgent safety report”; never claim they are prioritized/reviewed first.
- States: idle, selected, details, submitting, success, failed and offline exactly as the Handoff describes.
- During submit, fields are disabled and Escape must not dismiss the dialog mid-request.
- Failure keeps user input; offline disables submit with the supplied message.
- API validates with zod, writes `Report`, rate-limits abuse and includes a honeypot.

## Done when
- Full report flow works keyboard-first and mobile.
- Copyright/privacy handoffs preserve the current video context.
- Failed/offline/submitting behavior matches the Handoff without outcome promises.

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
- Commit message must be `T25: <task title>`.
