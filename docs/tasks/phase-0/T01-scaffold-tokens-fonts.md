# T01 — Scaffold, tokens and fonts

## Prerequisite
None. This is the first implementation task.

## Attach / inspect
- GayVideo Developer Handoff
- Board 1b
- Board 1o

## Creates
- `package.json`
- `tsconfig.json`
- `next.config.ts`
- `.eslintrc`
- `.prettierrc`
- `vitest.config.ts`
- `styles/tokens.css`
- `styles/globals.css`
- `app/layout.tsx`
- `components/primitives/Icon.tsx`

## Implement
- Scaffold Next.js 15 App Router with TypeScript strict.
- Scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `db:migrate`, `db:seed`, `worker`.
- Copy the Handoff `:root` token block verbatim.
- Add responsive gutter variables, `.gv-container`, and `.gv-grid` matching the Handoff breakpoints.
- Load Geist and Geist Mono with `next/font`.
- `Icon` renders Material Symbols Rounded ligatures and defaults to `aria-hidden`.
- Body background must be `#09090B`.
- Add reduced-motion rules from the Handoff.

## Done when
- `npm run dev` shows an empty dark page.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run build` passes.


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
- Commit message must be `T01: <task title>`.
