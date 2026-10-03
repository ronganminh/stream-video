# T17 — Review queue, video list, video editor

## Prerequisite
T16 merged.

## Creates
- `app/admin/review/*`
- `app/admin/videos/*`
- `app/admin/videos/[id]/*`

## Implement
- Review drafts newest first, thumbnail + embed preview + inline title/slug/category/tags/quality.
- Actions: Approve & publish, Reject (hide), bulk approve.
- Video table search + filters for status/published/hidden/category/missing host.
- Bulk category/tag and hide/unhide.
- Editor for all editable fields + thumbnail replacement.
- Mirrors panel per enabled host with status, search/similarity suggestions, link/unlink/re-check.
- zod server actions + audit rows.

## Done when
- Admin can fully review and edit a draft safely.


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
- Commit message must be `T17: <task title>`.
