# T33 — Categories and Search states

## Prerequisite
T30 merged.

## Bug coverage
GV-008, GV-009.

## Creates
- `app/(public)/categories/CategoryBrowser.tsx`
- `app/(public)/categories/page.tsx`
- `app/(public)/categories/page.module.css`
- `app/(public)/search/page.tsx`
- `app/(public)/search/page.module.css`
- `app/(public)/search/SearchLoadMore.tsx`
- `components/shell/SearchBox.tsx`
- `components/shell/SearchBox.module.css`
- `components/shell/MobileSearch.tsx`
- `components/shell/MobileSearch.module.css`
- `components/shell/SearchSuggestions.tsx`
- `components/shell/SearchSuggestions.module.css`

## Implement
- Categories: distinguish no categories in the system from no matches for an entered filter; heading must match the active tab.
- Search: keep input, clear control, empty-state icon and recovery CTA stable for long queries and mobile widths.
- Clear-search icon button requires an accessible name and at least 44x44 touch target.
- Preserve existing search route/query behavior and noindex rules.

## Done when
- Empty category database shows an availability empty state, not a filter mismatch.
- A real category filter with no matches shows filter-specific copy.
- Search does not overlap or overflow at 320px and with long queries.
- Search keyboard behavior remains intact.

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

- Commit message: `T33: categories search states responsive`.
