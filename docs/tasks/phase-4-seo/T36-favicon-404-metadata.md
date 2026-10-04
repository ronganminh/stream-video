# T36 — Favicon and 404 metadata

## Prerequisite
T30 merged.

## Bug coverage
GV-004, GV-016.

## Creates
- `app/favicon.ico`
- `app/icon1.png`
- `app/icon2.png`
- `app/apple-icon.png`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/not-found.module.css`

## Implement
- Add the existing approved G mark as favicon/app icons; do not invent a new logo.
- Provide 32x32, 192x192 and 180x180 Apple-touch coverage through Next metadata/file conventions.
- Give the real 404 page an appropriate `Page not found | GayVideo.fun` title and noindex behavior.
- Preserve a true 404 HTTP response and existing recovery/navigation design.
- Do not add About/Contact pages in this task.

## Done when
- `/favicon.ico` returns an icon, not the 404 page.
- Browser tab shows the approved mark on cold cache.
- Unknown route returns HTTP 404, page-specific title and noindex.

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

- Commit message: `T36: favicon 404 metadata`.
