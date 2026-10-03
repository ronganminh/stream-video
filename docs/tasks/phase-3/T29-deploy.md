# T29 — Deploy

## Prerequisite
T28 merged and green.

## Creates
- `Dockerfile.web`
- `Dockerfile.worker`
- existing `docker-compose.yml` (replace the T03 dev-only compose with the final production compose)
- `Caddyfile`
- `scripts/backup.sh`
- `ops/backup/**`
- existing `.env.example`, only for production deployment variables required by this task
- `docs/DEPLOY.md`

## Implement
- Production images for web + worker.
- Final services: web, worker, postgres, caddy.
- HTTPS + security headers.
- CSP `frame-src` derived from host registry `embedDomains`.
- Serve `/media`.
- Daily `pg_dump`, 14-day retention.
- Deployment docs: VPS setup, env, migrations, `admin:create`, API-key verification.

## Done when
- Fresh VPS deployment can be completed from docs and health-checked.


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
- Commit message must be `T29: <task title>`.
