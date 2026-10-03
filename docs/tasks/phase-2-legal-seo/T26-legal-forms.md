# T26 — Legal pages and forms

## Prerequisite
Phase 1 merged.

## Attach
Boards 2k, 2l, 2x.

## Creates
Routes:
- `/content-removal`
- `/content-removal/dmca`
- `/content-removal/request`
- `/privacy`
- `/terms`
- `/cookies`
- `app/api/requests`

## Implement
- Narrow reading column + section navigation.
- Every legal passage must be exactly a placeholder block labelled:
  `LEGAL COPY — FINAL TEXT REQUIRED`
- Forms include validation, error, success.
- Mobile sticky submit button.
- Do not create compliance claims.

## Done when
- Pages match boards and forms submit correctly.


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
