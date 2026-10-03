# T10 — Search

## Prerequisite
T09 merged.

## Attach
Boards 1f, 1l, 1m search states.

## Creates
- `components/shell/SearchBox.tsx`
- `components/shell/SearchSuggestions.tsx`
- `components/shell/MobileSearch.tsx`
- `app/api/search/suggest/route.ts`
- `components/shell/{SearchBox,SearchSuggestions,MobileSearch}.module.css`

## Implement
- Accessible combobox.
- ⌘K/Ctrl+K focuses search.
- Arrow keys move suggestions, Enter submits, Esc closes.
- Suggestions: recent searches (localStorage), trending, tags, categories, matching videos.
- Mobile full-screen idle and typing states.
- API calls `getSuggestions`.
- Placeholder exactly: “Search videos, categories or tags”.

## Done when
- Keyboard and mobile flows match designs.


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
- Commit message must be `T10: <task title>`.
