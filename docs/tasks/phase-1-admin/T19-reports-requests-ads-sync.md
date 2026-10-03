# T19 — Reports, requests, ads, sync log

## Prerequisite
T18 merged.

## Creates
- `app/admin/reports/*`
- `app/admin/requests/*`
- `app/admin/ads/*`
- `app/admin/sync/*`

## Implement
- Reports: urgent categories first; hide video + resolve actions.
- Requests: DMCA/removal requests with status and notes.
- Ads: one HTML snippet + enabled flag per slot.
- Sync log: SyncRun history + error details.
- zod server actions + audit rows.

## Done when
- Admin operational queues are usable and audited.


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
- Commit message must be `T19: <task title>`.
