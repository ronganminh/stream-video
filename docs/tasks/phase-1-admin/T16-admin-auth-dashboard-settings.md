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
