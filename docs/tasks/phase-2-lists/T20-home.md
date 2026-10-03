# T20 — Home page

## Prerequisite
Phase 1 merged.

## Read / attach
- `lib/types.ts`, `lib/data/index.ts`, component index exports
- Boards 1c, 1e, 1g
- Handoff route metadata

## Creates
Only Home route files required by the plan, including page/loading/metadata support.

## Implement
- Build `/` exactly from designs.
- Use existing data API and components.
- Include loading skeletons and empty handling where applicable.
- Preserve responsive layout and SSR.

## Done when
- Home matches boards and builds without modifying contracts.


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
