# T14 — Host providers

## Prerequisite
T04 and T03 merged.

## Current API documentation required
Use current official API documentation for DoodStream, VOE and EarnVids. If web access is available, retrieve the official documentation yourself; otherwise the user must attach it. Do not invent endpoints, authentication, limits, or response fields.

## Creates
- `lib/hosts/types.ts` 🔒
- `lib/hosts/dood.ts`
- `lib/hosts/voe.ts`
- `lib/hosts/earnvids.ts`
- `lib/hosts/registry.ts`
- `lib/sync/normalize.ts`
- `lib/hosts/*.test.ts`
- `lib/sync/normalize.test.ts`
- `lib/hosts/__fixtures__/*.json`

## Implement
- HostProvider interface from the Implementation Plan.
- Registry maps host IDs to providers.
- Timeouts, retry with backoff, per-host rate limiting.
- API keys via `HOST_<ID>_API_KEY`.
- `normalize()`: strip extension → lowercase → remove diacritics → non-alphanumeric runs to one space → trim.
- Tests use recorded JSON fixtures.

## Done when
- Provider tests pass using real documented API shapes.


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
- Commit message must be `T14: <task title>`.
