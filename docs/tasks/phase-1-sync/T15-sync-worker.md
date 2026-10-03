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
- `lib/sync/settings.ts`
- `worker/index.ts`
- `worker/cli.ts`
- `lib/sync/*.test.ts`
- `worker/*.test.ts`
- existing `.env.example`, only for worker/media variables needed by this task

## Implement
- Host-agnostic sync algorithm exactly from §7 of the plan.
- PostgreSQL advisory lock prevents overlapping runs.
- Write a `SyncRun` for every run and pick up `SyncRequest` rows.
- CLI: `sync:new`, `sync:health`.
- Never overwrite MANUAL mirrors and never hard-delete in sync.
- Primary host is read from DB; server order remains `Host.sortOrder`.
- Use these Setting keys so T16 writes the same configuration:
  - `syncNewIntervalMinutes` — default 15
  - `syncHealthIntervalHours` — default 24
  - `syncAutoMatchEnabled` — default true
- Keep parsing/default logic in `lib/sync/settings.ts`; worker scheduling should re-read settings so admin changes take effect without a code deploy.
- Thumbnail storage uses `MEDIA_DIR`; default local development path may be `public/media`. Store WebP and persist a public `/media/...` path, while T29 will mount a shared production media volume.

## Done when
- Sync tests cover create/match/duplicate/primary-change/health behavior.
- Worker and CLI use the same settings/locking logic.
- Changing the primary host does not rewrite existing mirrors and changing sync settings does not require source-code edits.

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
- Commit message must be `T15: <task title>`.
