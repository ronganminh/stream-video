# T22 — Categories and Tag pages

## Prerequisite
Phase 1 merged.

## Attach
Boards 2d, 2e, 2f, 2r, 2s, 3a plus Handoff SEO/pagination rules.

## Creates
- `app/(public)/categories/**`
- `app/(public)/category/[slug]/**`
- `app/(public)/tag/[slug]/**`

Keep page, loading, metadata exports and route-local CSS/components inside those directories.

## Implement
- `/categories` includes the designed client-side category filter while its initial category content remains server-rendered.
- Category pages support `sort`, `duration`, `date` and `page` from the URL; real `?page=n` links work with JS disabled.
- Tag pages are `noindex` when the tag has fewer than 5 visible videos.
- Filtered/sorted list variants use Handoff canonical/noindex behavior.
- Match category/tag layouts exactly and use existing data contracts/components only.
- Add loading/empty/error states and BreadcrumbList structured data as specified by the Handoff.
- Use the shared list ad slot only where shown in the supplied designs.

## Done when
- Routes match boards and handle loading/empty states.
- Category/tag pagination works with JS disabled.
- Thin-tag indexing and filtered canonical rules are correct.

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
- Commit message must be `T22: <task title>`.
