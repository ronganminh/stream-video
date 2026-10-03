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
- CSS modules as needed

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
