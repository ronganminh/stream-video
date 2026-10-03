# T20 — Home page

## Prerequisite
Phase 1 merged.

## Read / attach
- `lib/types.ts`, `lib/data/index.ts`, component exports
- Boards 1c, 1e, 1g
- Handoff route metadata, ad slots and SEO/pagination sections

## Creates
- delete the temporary T01 placeholder `app/page.tsx`
- `app/(public)/page.tsx`
- `app/(public)/loading.tsx`
- `app/(public)/page.module.css`
- `app/(public)/_home/**`, only for Home-specific support/client components such as progressive Load More

## Implement
- Replace the temporary T01 root placeholder with the real Home route inside the `(public)` route group so it inherits `app/(public)/layout.tsx`.
- Build `/` exactly from designs using existing data contracts/components.
- Include skeleton/loading and empty handling where applicable.
- Home's last video grid has progressive Load More. Because `getHome().latest.nextHref` belongs to `/latest`, Home-specific enhancement must fetch the next Latest page without incorrectly replacing the browser URL with `/latest`; keep a real fallback link to Latest when JS is unavailable.
- Use T19 ad data with the Handoff spacing rule: no more than one ad per two Home sections; no-fill collapses through `AdSlot`.
- Preserve SSR and route metadata/canonical behavior from the Handoff.

## Done when
- Home matches boards and `/` resolves through the public layout with no duplicate-route conflict.
- Home Load More appends content without changing the visible route to `/latest`.
- No-JS users still have a real navigation path to more Latest content.
- Build passes without modifying locked contracts.

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
- Commit message must be `T20: <task title>`.
