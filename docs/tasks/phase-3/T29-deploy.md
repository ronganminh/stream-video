# T29 — Deploy

## Prerequisite
T28 merged and green.

## Creates
Deployment files only:
- production Dockerfiles for web/worker
- final Docker Compose
- Caddyfile
- backup scripts/config
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
