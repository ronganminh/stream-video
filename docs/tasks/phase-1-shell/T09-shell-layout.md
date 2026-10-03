# T09 — Header, MobileHeader, BottomNav, Footer, public layout

## Prerequisite
T04 merged.

## Attach
Boards 1c, 1g, 1h, 1o, 1p, 3b, 3f.

## Creates
- `components/shell/Header.tsx`
- `components/shell/MobileHeader.tsx`
- `components/shell/BottomNav.tsx`
- `components/shell/Footer.tsx`
- `app/(public)/layout.tsx`
- CSS modules as needed

## Implement
- Header nav collapses lower-priority links into “More” as width narrows.
- BottomNav: home, hot, search, categories, more.
- Hide BottomNav on `/watch` and full-screen search.
- Footer desktop/mobile with “Adults only”.
- 2257 link hidden unless enabled by setting.

## Done when
- Responsive shell matches supplied boards.


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
- Commit message must be `T09: <task title>`.
