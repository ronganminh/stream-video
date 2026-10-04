# T37 — Production regression coverage

## Prerequisite
T30, T31, T32, T33, T34, T35 and T36 all merged and green.

## Bug coverage
GV-019 plus regression coverage for GV-001 and GV-004 through GV-018, excluding final legal-copy content.

## Creates
- `tests/e2e/responsive-a11y.e2e.ts`
- `tests/e2e/public.e2e.ts`
- `tests/e2e/admin.e2e.ts`
- `tests/e2e/production-regression.e2e.ts`
- `playwright.config.ts`

## Implement
- Automated checks at 1440, 1280, 1024, 768, 390, 375, 360 and 320.
- Assert no document horizontal overflow for representative public/admin routes.
- Assert common Material Symbols ligature names are not visible text.
- Run axe on key shell, listing, discovery, legal form and admin views with no serious violations.
- Cover one main landmark, semantic menu buttons, contextual empty states, footer destinations and 404 metadata/status.
- Cover DMCA/removal POST flow without PII in URL using deterministic test data.
- Do not fix application code in T37. If a test exposes an app regression requiring another file, stop and open a follow-up scoped task.

## Done when
- All new regression tests pass in CI.
- Full existing Playwright suite remains green.
- No application file was changed in this task.

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

- Commit message: `T37: production regression coverage`.
