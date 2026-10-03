# T11 — Age gate

## Prerequisite
T10 merged.

## Attach
Boards 1i, 3f and Handoff “Age gate behavior”.

## Creates
- `components/shell/AgeGate.tsx`
- `components/shell/AgeGate.module.css`
- existing `app/(public)/layout.tsx`, only to mount the gate and pass server-derived acknowledgement/settings
- `lib/settings/ageGate.ts`
- `middleware.ts`, only if request/cookie handling actually needs middleware

## Implement
- Desktop modal and mobile full-screen treatment matching the supplied boards.
- “I'm 18 or older” sets an acknowledgement cookie and continues to the requested URL.
- Read the acknowledgement server-side so acknowledged users do not receive unnecessary gate UI.
- Cookie persistence comes from `Setting.key = "ageGateCookieLifetimeDays"`.
- If that setting is absent/invalid, use a **session cookie** (omit persistent max-age/expiry); do not invent a persistent legal/product lifetime.
- Keep the setting key/parsing in `lib/settings/ageGate.ts` so T16 can write the same key later.
- “Leave” navigates away; the final external destination is not defined by the design, so keep it configurable/localized to this component rather than inventing a compliance destination.
- Public page HTML remains server-rendered behind the gate. Do not redirect anonymous users to a separate gate-only route and do not add crawler bypass claims.
- Legal/body placeholder copy is exactly `LEGAL COPY — FINAL TEXT REQUIRED`.
- Focus trap, sensible initial focus, Escape behavior, focus return, 44px mobile targets and reduced-motion support.

## Done when
- Gate is visibly mounted in the public shell on an unacknowledged visit.
- Acknowledgement suppresses the gate according to the database setting, or for the browser session when the setting is missing.
- Server-rendered public HTML is preserved.
- Keyboard/focus behavior and desktop/mobile visuals match the Handoff.

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
- Commit message must be `T11: <task title>`.
