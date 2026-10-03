# T16 — Auth, admin shell, dashboard, Hosts and Settings

## Prerequisite
T04 and T03 merged.

## Creates
- `lib/auth/*`
- `app/admin/layout.*`
- `app/admin/page.*`
- `app/admin/login/*`
- `app/admin/hosts/*`
- `app/admin/settings/*`
- `scripts/admin-create.ts`

## Implement
- Admin pages are English and `noindex`.
- Server actions use zod and write `AdminAction` audit rows.
- Email/password auth with bcrypt, signed httpOnly cookie, login rate limit.
- Dashboard counts drafts, published, missing by host, primary-host missing, removed, uncategorized, open reports; show last SyncRun + Sync now.
- Hosts page: enabled, Primary radio, server-order drag handle; confirmation when primary changes.
- Settings: sync intervals, auto-match, age-gate cookie lifetime, 2257 flag, change password.

## Done when
- Auth and settings changes persist and audit correctly.


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
- Commit message must be `T16: <task title>`.
