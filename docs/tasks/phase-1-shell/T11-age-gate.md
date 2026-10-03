# T11 — Age gate

## Prerequisite
T10 merged.

## Attach
Boards 1i, 3f and Handoff “Age gate behavior”.

## Creates
- `components/shell/AgeGate.tsx`
- `middleware.ts`

## Implement
- Modal desktop, full-screen mobile.
- “I'm 18 or older” sets acknowledgement cookie.
- Cookie lifetime comes from settings.
- “Leave” navigates away.
- Server-rendered HTML remains crawlable.
- Do not add compliance claims.

## Done when
- Gate behavior matches Handoff and remains accessible.


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
- Commit message must be `T11: <task title>`.
