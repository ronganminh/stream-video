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
- existing `.env.example`, only for admin-auth environment variables
- existing `app/(public)/layout.tsx`, only to wire the 2257 visibility setting into the existing Footer; preserve all shell/search/age-gate behavior

## Implement
- Admin pages are English and `noindex`.
- Server actions use zod and write `AdminAction` audit rows.
- Email/password auth with bcrypt, a signed httpOnly cookie, login rate limiting, and a non-committed `ADMIN_SESSION_SECRET`.
- Dashboard counts drafts, published, missing by host, primary-host missing, removed, uncategorized and open reports; show last SyncRun + Sync now.
- **Sync now** creates a `SyncRequest`; it does not call host APIs inside the web request.
- Hosts page: enabled, Primary radio, server-order drag handle; confirmation when primary changes. Server order remains independent from primary.
- Settings must read/write these exact `Setting.key` values so other lanes consume the same configuration:
  - `syncNewIntervalMinutes`
  - `syncHealthIntervalHours`
  - `syncAutoMatchEnabled`
  - `ageGateCookieLifetimeDays`
  - `show2257`
- Leaving/deleting `ageGateCookieLifetimeDays` means session-only acknowledgement, matching T11; do not invent a persistent legal duration.
- Public layout reads `show2257` and passes it to the existing Footer. Do not redesign Footer or the shell.
- Change-password flow updates the current AdminUser securely.

## Done when
- Auth and settings persist and audit correctly.
- Sync now creates a pending request consumed by the worker.
- Changing `show2257` changes Footer visibility without source-code edits.
- T11 age-gate behavior remains intact after the public-layout integration.

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
