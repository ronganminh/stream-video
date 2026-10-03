# T05 — Thumbnail, VideoCard, RankCard

## Prerequisite
T04 merged.

## Read / attach
- `lib/types.ts`, `lib/format.ts`, `components/primitives/index.ts`, `styles/tokens.css`
- Handoff
- Boards 1c, 1e, 1j, 1m, 3c, 3d

## Creates
- `components/cards/Thumbnail.tsx` + CSS module
- `components/cards/VideoCard.tsx` + CSS module
- `components/cards/RankCard.tsx` + CSS module

## Implement
- Thumbnail: 16:9, cover, lazy loading, reserved size, branded fallback on null/error.
- VideoCard variants: default, hot, new, watched, loading, removed, fallback; optional quality badge and most-watched rank.
- 2-line title clamp, 1-line metadata, aligned grid cards.
- Desktop hover zoom disabled under reduced motion.
- RankCard numerals: 120 px desktop, 84 px mobile.

## Done when
- Components visually match supplied boards.


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
- Commit message must be `T05: <task title>`.
