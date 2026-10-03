# T14 — Host providers

## Prerequisite
T04 and T03 merged.

## IMPORTANT INPUT REQUIRED
Before coding, provide current API documentation for DoodStream, VOE and EarnVids. Do not invent endpoints or response fields.

## Creates
- `lib/hosts/types.ts` 🔒
- `lib/hosts/dood.ts`
- `lib/hosts/voe.ts`
- `lib/hosts/earnvids.ts`
- `lib/hosts/registry.ts`
- `lib/sync/normalize.ts`
- tests
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
