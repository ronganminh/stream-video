# T24 — Watch page and player

## Prerequisite
Phase 1 merged.

## Attach
Boards 1d, 1h, 1k, 2j, 2v.

## Creates
Route/player files for `/watch/[slug]`, including loading and metadata.

## Implement
- Poster with Play button; mount first OK mirror iframe only after Play.
- Server 1/2/3 switcher + “Not playing? Try another server”.
- Loading state until iframe `onLoad`.
- Count one view on first Play.
- REMOVED returns HTTP 410.
- PROCESSING/BLOCKED/FAILED neutral wrapper states.
- Age-restricted state.
- Draft/hidden: 404.
- Actions: Like, Save(localStorage), Share, Report.
- Tags, description, Up Next, More like this, Popular, Related tags.
- `VideoObject` JSON-LD.

## Done when
- Player and all availability states match boards.


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
- Commit message must be `T24: <task title>`.
