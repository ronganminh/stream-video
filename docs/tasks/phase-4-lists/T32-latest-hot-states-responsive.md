# T32 — Latest/Hot states and responsive filters

## Prerequisite
T30 merged.

## Bug coverage
GV-005, GV-006, GV-007.

## Creates
- `components/filters/FilterToolbar.tsx`
- `components/filters/FilterToolbar.module.css`
- `components/filters/FilterBottomSheet.tsx`
- `components/filters/FilterBottomSheet.module.css`
- `app/(public)/latest/page.tsx`
- `app/(public)/latest/page.module.css`
- `app/(public)/hot/page.tsx`
- `app/(public)/hot/page.module.css`

## Implement
- Fix filter label/value/icon overlap and mobile overflow.
- Preserve no-JS list navigation through query strings / `?page=n`.
- Latest: distinguish system-empty default state from filtered-no-results state.
- Hot: provide the designed empty state and recovery CTA instead of blank content.
- Do not change data contracts or public visibility rules.

## Done when
- No page horizontal scroll at 320/375/390/768/desktop.
- Default Latest with zero published videos says no videos are available, not that filters caused the result.
- Filtered Latest uses the filtered-no-results state.
- Hot zero-data state is visible, useful and keyboard accessible.

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

- Commit message: `T32: latest hot states responsive`.
