# T28 — QA and end-to-end tests

## Prerequisite
T20–T27 merged.

## Creates
Only QA/test files required for this task.

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
- E2E suite passes and documented responsive/a11y checks pass.


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
