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

## Recommended branch workflow

For every tab:
1. Read the matching packet.
2. Create a branch named `task/Txx-short-name` from the latest required base.
3. Implement only that task.
4. Run the packet's checks.
5. Commit as `Txx: <title>`.
6. Open a PR back to `main`.
7. Merge prerequisite tasks before starting dependent tasks.

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
