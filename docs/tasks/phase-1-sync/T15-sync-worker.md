# T15 — Sync jobs and worker

## Prerequisite
T14 merged.

## Read first
- `lib/hosts/types.ts`
- `prisma/schema.prisma`
- Implementation Plan sync algorithm

## Creates
- `lib/sync/newVideos.ts`
- `lib/sync/healthCheck.ts`
- `lib/sync/match.ts`
- `lib/sync/thumbnails.ts`
- `worker/index.ts`
- `worker/cli.ts`
- tests

## Implement
- Host-agnostic sync algorithm exactly from plan.
- PostgreSQL advisory lock prevents overlapping runs.
- Write a `SyncRun` for every run.
- Pick up `SyncRequest` rows.
- CLI: `sync:new`, `sync:health`.
- Never overwrite MANUAL mirrors.
- Never hard-delete in sync.
- Primary host is read from DB, not hardcoded.

## Done when
- Sync tests cover create/match/duplicate/primary-change/health behavior.


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
- Commit message must be `T15: <task title>`.
