# T30 — Icon/font production fix

## Prerequisite
T29 merged and production audit reproduced.

## Bug coverage
GV-001.

## Creates
- `styles/globals.css`
- `app/layout.tsx`
- `Caddyfile.template`
- `Caddyfile`
- `scripts/generate-caddy.ts`
- `scripts/generate-caddy.test.ts`
- `tests/e2e/icon-font.e2e.ts`

## Implement
- Keep the locked `<Icon />` Material Symbols Rounded ligature contract unchanged.
- Fix production font loading so ligature names never render as visible text on cold cache/incognito.
- Remove duplicate/fragile font loading if present.
- If CSP is the cause, update generated Caddy policy through the existing template/generator, never by creating a second permanent manual CSP source.
- Add layout containment/fallback sizing so a transient font failure cannot expand controls or create horizontal overflow.
- Verify header, empty states, filters, bottom nav and Admin Hosts.

## Done when
- No visible strings such as `search`, `menu`, `video_library`, `drag_indicator`, `more_horiz` appear as icons.
- Cold-cache browser test passes on desktop and 390/320px.
- Generated Caddy drift test passes.
- No new horizontal overflow is caused by icons.

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

- Commit message: `T30: icon font production fix`.
