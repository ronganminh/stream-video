# T29 — Deploy

## Prerequisite
T28 merged and green.

## Creates
- `Dockerfile.web`
- `Dockerfile.worker`
- existing `docker-compose.yml` (replace the T03 dev-only compose with final production services)
- `Caddyfile`
- `Caddyfile.template`
- `scripts/generate-caddy.ts`
- `scripts/generate-caddy.test.ts`
- `scripts/backup.sh`
- `ops/backup/**`
- existing `.env.example`, only for production deployment variables
- existing `next.config.ts`, only if the chosen production image requires Next standalone/output configuration
- existing `package.json`, only for minimal deployment/config-validation scripts if needed
- existing `.github/workflows/ci.yml`, only to add Docker/Compose/Caddy deployment-artifact validation
- `docs/DEPLOY.md`

## Implement
- Production images for web + worker.
- Final Compose services: web, worker, postgres, caddy, with healthchecks/restart behavior and a shared media volume used by T15 `MEDIA_DIR`.
- HTTPS + security headers in Caddy.
- CSP `frame-src` must be **generated from** `lib/hosts/registry.ts` provider `embedDomains`; do not manually duplicate a permanent host list in Caddy.
- `scripts/generate-caddy.ts` renders/updates the generated Caddyfile from `Caddyfile.template`; its test detects drift between registry domains and committed/generated CSP.
- Serve `/media` from the shared media volume.
- Daily `pg_dump`, 14-day retention; document the scheduler/cron mechanism.
- Deployment docs: VPS setup, env, migrations, media permissions, `admin:create`, backup restore, API-key verification and health checks.
- Never commit real API keys, session secrets or production passwords.

## GitHub Actions deployment validation
- Build both production Docker images.
- Run `docker compose config`.
- Validate/generate Caddy config and fail on registry/CSP drift.
- Run the normal type/lint/test/build gates.
- A real VPS is not required to merge T29 when no deployment credentials are connected; in that case CI validates the artifacts and `docs/DEPLOY.md` contains the exact post-deploy health-check commands. If a VPS is available, perform the health check there as an additional release validation.

## Done when
- CI proves both images build and Compose/Caddy configuration is valid.
- CSP frame sources match the host registry automatically.
- Backup retention/restore procedure is documented.
- A fresh VPS can be deployed by following `docs/DEPLOY.md` without inventing missing steps.

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
