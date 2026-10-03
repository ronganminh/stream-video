# T27 — Errors and SEO

## Prerequisite
T26 merged.

## Attach
Board 2i and Handoff route map / SEO-paging rules.

## Creates
- `app/not-found.tsx`
- `app/not-found.module.css`
- `app/error.tsx`
- `app/error.module.css`
- `app/robots.ts`
- `app/sitemap.ts`
- `app/sitemap.xml/**`, only if a custom index Route Handler is required
- `app/sitemaps/**`
- `lib/seo/**`

## Implement
- Real 404 response with the designed Trending row; do not render a 200 “not found” page.
- `app/error.tsx` is a Client Component as required by the Next.js error-boundary convention; keep the rest server-first.
- Sitemap output is split into videos, categories, tags and static pages, with a discoverable sitemap index.
- Prefer Next 15 metadata APIs/`generateSitemaps` where they satisfy the required index. If a custom sitemap-index handler is needed, use the allowed `app/sitemap.xml/**` / `app/sitemaps/**` scope and do not create conflicting sitemap handlers.
- Only publicly indexable videos/categories/tags are emitted.
- `robots.txt` disallows `/admin`, `/api` and `/search` and references the sitemap index.
- Verify any existing middleware matcher does not intercept robots/sitemap/static metadata routes.
- Follow route metadata/canonical rules already implemented by T20–T26 rather than rewriting those pages in this task.

## Done when
- 404/error pages render with correct HTTP/error-boundary behavior.
- Robots and every sitemap endpoint validate.
- Sitemap contains no draft/hidden/unavailable video URLs and is reachable by crawlers without age-gate middleware interference.

## GitHub delivery workflow
- Start from the latest `main` after all listed prerequisites are merged. Work on a `task/Txx-<short-name>` branch.
- After implementation, run the task-specific **Done when** checks that are possible in the task environment, then commit/push and open a PR to `main`.
- Inspect the GitHub Actions run for the PR/head commit yourself.
- If CI fails, read the failed job, failed step, and job logs; fix only files allowed by **Creates**, commit/push, and inspect the new Actions run. Repeat until green.
- If a required fix would touch a file outside **Creates** or a locked 🔒 contract not explicitly allowed here, stop and report the blocker instead of changing scope.
- CI green is mandatory but does not replace task-specific checks that CI cannot cover (for example visual comparison, Docker migration, E2E, or VPS deployment).
- When CI is green and **Done when** passes, squash-merge the PR into `main`.
- Do not ask the user to run CI, Desktop Commander, or paste CI logs when GitHub tools are available.

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
