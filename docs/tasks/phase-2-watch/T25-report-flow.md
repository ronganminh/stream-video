# T25 — Report flow

## Prerequisite
T24 merged.

## Attach
Boards 2m, 2w.

## Creates
- Report UI on Watch
- `app/api/reports` route
- supporting task-local files only

## Implement
- Desktop modal, mobile bottom sheet.
- Steps: reason → details → received.
- Attach current URL automatically; email optional.
- Underage/non-consensual/illegal reasons labelled “Urgent safety report” with no promises about outcome.
- Copyright routes to `/content-removal/dmca`.
- States: idle, selected, submitting, success, failed, offline.
- Spam protection: rate limit + honeypot.

## Done when
- Full report flow works keyboard-first and mobile.


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
