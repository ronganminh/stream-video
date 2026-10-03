# T07 — Modal, BottomSheet, Toast

## Prerequisite
T06 merged.

## Attach
Boards 1m, 2m, 2w.

## Creates
- `components/feedback/Modal.tsx`
- `components/feedback/BottomSheet.tsx`
- `components/feedback/Toast.tsx`
- CSS modules as needed

## Implement
- Focus trap, Escape close, scroll lock, and focus return for all three.
- BottomSheet: drag handle + backdrop.
- Toast: `role=status`, auto-close after 2.2s, provider + `useToast()`.

## Done when
- Keyboard/focus behavior works and visual states match.


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
- Commit message must be `T07: <task title>`.
