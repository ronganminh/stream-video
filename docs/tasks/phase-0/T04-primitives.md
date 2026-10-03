# T04 — Primitives 🔒

## Prerequisite
T03 merged.

## Read / attach
- `styles/tokens.css`
- Developer Handoff
- Boards 1j and 1m

## Creates
- `components/primitives/Button.tsx` + CSS module
- `components/primitives/IconButton.tsx` + CSS module
- `components/primitives/Badge.tsx` + CSS module
- `components/primitives/TagChip.tsx` + CSS module
- `components/primitives/Tabs.tsx` + CSS module
- `components/primitives/index.ts`
- `app/dev/primitives/page.tsx`

## Implement
- Button variants: primary, secondary, ghost, danger, loading, disabled. Sizes 36/44/50 px. Link rendering via `href`.
- IconButton variants: surface, ghost, overlay. `aria-label` required.
- Badge variants: hot, trending, new, quality, duration, 18+, ad, most-watched.
- TagChip: default, selected, focus; link by default; toggle button when filtering.
- Tabs: segmented and underline variants with ARIA tabs.
- Showcase every variant at `/dev/primitives`.

## Done when
- Showcase matches the supplied boards.


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
- Commit message must be `T04: <task title>`.
