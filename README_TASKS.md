# stream-video — Chat Task Workflow

This repository is organized so multiple ChatGPT tabs can work in parallel without editing the same files.

## Core rule

One chat = one task `Txx`.

Each task packet lives under `docs/tasks/` and contains:
- prerequisites
- files/context to read
- design boards to inspect
- exact `Creates` scope
- implementation requirements
- acceptance checks
- branch and commit naming

Never modify files outside a task's `Creates` list. Never change a 🔒 contract file unless the packet explicitly permits it.

## Mandatory branch / CI workflow

For every tab:
1. Read the matching packet and the current repository.
2. Create a branch named `task/Txx-short-name` from the latest `main` after all prerequisites are merged.
3. Implement only that task and only its allowed `Creates` scope.
4. Run the packet's task-specific **Done when** checks.
5. Commit as `Txx: <title>`, push the branch, and open a PR to `main`.
6. Inspect the GitHub Actions run for the PR/head commit yourself.
7. If CI fails, read the failed job/step logs, fix within the task scope, push, and inspect the new run. Repeat until green.
8. Do not merge if the fix would require an out-of-scope or locked-file change; report that blocker instead.
9. When CI is green and the task-specific checks pass, squash-merge the PR into `main`.
10. Do not hand CI back to the user or ask for Desktop Commander when GitHub tools are available.

CI is a mandatory gate, but it does not replace checks that GitHub Actions does not cover, such as visual comparison, Docker migration, full E2E, or a real VPS deployment.

## Parallel schedule

### Phase 0 — sequential
`T01 -> T02 -> T03 -> T04`

Do not run these in parallel.

### Phase 1 — five independent lanes after T04
- UI: `T05 -> T06 -> T07 -> T08`
- Shell: `T09 -> T10 -> T11`
- Data: `T12 -> T13`
- Sync: `T14 -> T15`
- Admin: `T16 -> T17 -> T18 -> T19`

After T04 is merged, you can open five tabs at once for T05, T09, T12, T14 and T16.

### Phase 2 — four independent lanes after Phase 1
- Lists: `T20 -> T21`
- Discovery: `T22 -> T23`
- Watch: `T24 -> T25`
- Legal/SEO: `T26 -> T27`

You can open four tabs at once for T20, T22, T24 and T26.

### Phase 3 — sequential
`T28 -> T29`

## Shared project rules

- Next.js 15 App Router, TypeScript strict.
- CSS Modules only; use `--gv-*` variables from `styles/tokens.css`.
- No Tailwind and no UI libraries.
- PostgreSQL + Prisma, zod, Vitest.
- Fonts: Geist / Geist Mono.
- Icons: Material Symbols Rounded via `<Icon />`.
- All UI text is English.
- Server Components by default.
- Public list pages must still work without JavaScript via `?page=n`.
- New videos are DRAFT until approved.
- Public videos must be published, not hidden, AVAILABLE, and have at least one OK mirror.
- Never hardcode one host as primary; use the host registry/database setting.
- Views and likes are counted on this site.
- Legal prose is always the placeholder: `LEGAL COPY — FINAL TEXT REQUIRED`.

## Design source

The implementation follows the provided GayVideo.fun handoff/mockups exactly. Do not invent a new visual style.

When opening a new chat, upload:
1. the matching `docs/tasks/.../Txx-*.md` packet,
2. the GayVideo UI mockup ZIP / Developer Handoff when the packet requires design boards,
3. any contract files named in the packet if the chat cannot read this GitHub repo directly.

Then message: `Implement Txx exactly from the attached packet and repository. Return complete files only.`
