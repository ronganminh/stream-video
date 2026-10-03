# T27 — Errors and SEO

## Prerequisite
T26 merged.

## Attach
Board 2i and Handoff route map.

## Creates
- not-found route
- error route
- sitemap implementation
- robots implementation
- supporting task-local SEO files only

## Implement
- Real 404 with Trending row.
- Sitemap index split into videos, categories, tags, static pages.
- `robots.txt` disallows `/admin`, `/api`, `/search`.
- Follow route metadata rules from Handoff.

## Done when
- Error pages render correctly and SEO endpoints validate.


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
- Commit message must be `T27: <task title>`.
