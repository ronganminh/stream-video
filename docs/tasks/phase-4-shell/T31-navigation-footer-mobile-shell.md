# T31 — Navigation, footer and mobile shell

## Prerequisite
T30 merged.

## Bug coverage
GV-010, GV-013, GV-014, GV-015, GV-018.

## Creates
- `components/shell/Header.tsx`
- `components/shell/Header.module.css`
- `components/shell/MobileHeader.tsx`
- `components/shell/MobileHeader.module.css`
- `components/shell/BottomNav.tsx`
- `components/shell/BottomNav.module.css`
- `components/shell/Footer.tsx`
- `components/shell/Footer.module.css`
- `app/(public)/layout.tsx`

## Implement
- Five bottom-nav items must fit from 320px upward and never cover final page content.
- Menu/More controls must be semantic buttons with accessible names, `aria-expanded`, `aria-controls`, Escape handling and keyboard-safe focus behavior.
- Make active navigation state consistent across Home, Latest, Hot, Most Viewed and Categories.
- Footer must not visually present dead text as links. Keep only working destinations; Report Content points to `/content-removal/request`. Do not invent a new privacy-preferences product surface.
- Ensure the public document has one primary `main` landmark only.

## Done when
- No shell horizontal overflow at 320, 375, 390, 768 and desktop.
- Keyboard-only navigation works.
- Footer has no dead faux links and no links to known 404 routes.
- Accessibility tree exposes menu controls as buttons and exactly one main landmark.

## GitHub delivery workflow
- Start from latest main after prerequisites merge.
- Branch: `task/Txx-<short-name>`.
- Modify only files in **Creates**.
- Run task-specific checks, then typecheck/lint/test/build as applicable.
- Push, open PR, inspect GitHub Actions, fix only in scope until green, then squash-merge.
- Stop and report a blocker if a fix requires a file outside **Creates** or a locked 🔒 contract.

## Rules for this chat
- Work on exactly this task only.
- Read the current repository first.
- Visual design is final; do not invent new styles.
- CSS Modules + existing `--gv-*` tokens only; no Tailwind/UI libraries.
- Server Components by default; client only for interaction.
- Keep visible focus, keyboard support and reduced-motion behavior.
- All product UI text is English.
- Do not change 🔒 contract files unless explicitly allowed.

- Commit message: `T31: navigation footer mobile shell`.
