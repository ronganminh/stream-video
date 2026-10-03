# T03 — Database schema and Docker 🔒

## Prerequisite
T02 merged.

## Read first
- `lib/types.ts`
- Implementation Plan database schema section

## Creates
- `prisma/schema.prisma` 🔒
- initial Prisma migration
- `docker-compose.yml`
- `.env.example`
- `lib/db.ts`

## Implement
- Implement the plan's database schema exactly.
- PostgreSQL 16.
- Enable `pg_trgm`.
- Add trigram index on `Video.title`.
- Add a partial unique index enforcing at most one `Host.isPrimary = true`.
- Dev Docker Compose contains PostgreSQL only.

## Done when
- `docker compose up -d`
- `npm run db:migrate`
both succeed.


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
- Commit message must be `T03: <task title>`.
