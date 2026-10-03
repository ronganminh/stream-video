# T23 — Search results page

## Prerequisite
T22 merged and T13 merged.

## Attach
Boards 2g, 2h, 2t, 2u plus Handoff search/SEO/pagination states.

## Creates
- `app/(public)/search/**`

Keep page, loading, metadata exports and route-local CSS/components inside that directory.

## Implement
- Always `noindex,follow`.
- Query contract is `q`, `duration`, `date`, `category`, `sort`, `page`.
- Search results use the Prisma-backed T13 `search` API with filters and real SSR pagination links.
- Show related categories/tags and the supplied recovery section when there are no results.
- Search loading state uses chips + grid skeletons; errors provide retry without discarding the query.
- Keep the page canonical/indexing behavior from the Handoff and do not expose fixture data.
- Use list ads only where the supplied search boards place them.

## Done when
- Search states match boards.
- `?page=n` works with JS disabled.
- Page remains `noindex,follow` for every query/filter/page variant.

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
- Commit message must be `T23: <task title>`.
