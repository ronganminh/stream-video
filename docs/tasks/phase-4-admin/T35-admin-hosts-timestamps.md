# T35 — Admin Hosts responsive and timestamps

## Prerequisite
T30 merged.

## Bug coverage
GV-012, GV-017.

## Creates
- `app/admin/hosts/HostsForm.tsx`
- `app/admin/hosts/page.tsx`
- `app/admin/hosts/page.module.css`
- `app/admin/page.tsx`
- `app/admin/page.module.css`

## Implement
- Make Hosts usable at 390/320px without hidden Enabled/Primary controls.
- Preserve host registry/database-driven primary behavior.
- Reorder must offer explicit Up/Down controls usable by touch and keyboard; drag may remain as progressive enhancement.
- Prevent order/icon content from overlapping host labels.
- Replace raw dashboard ISO display with human-readable English date/time including an explicit timezone; preserve raw ISO in semantic/tooltip metadata where practical.

## Done when
- Every host action is reachable at 320px without unexplained horizontal clipping.
- Primary/enabled/order operations remain server-validated and auditable.
- Keyboard-only reorder works.
- Dashboard no longer presents raw ISO as the primary visible timestamp.

## GitHub delivery workflow
- Start from latest main after prerequisites merge.
- Branch: `task/Txx-<short-name>`.
- Modify only files in **Creates**.
- Run task-specific checks, then typecheck/lint/test/build as applicable.
- Push, open PR, inspect GitHub Actions, fix only in scope until green, then squash-merge.
- Stop and report a blocker if a fix requires a file outside **Creates** or a locked 🔒 contract.

## Rules for this chat
- Work on exactly this task only.
- Read the current repository first.
- Visual design is final; do not invent new styles.
- CSS Modules + existing `--gv-*` tokens only; no Tailwind/UI libraries.
- Server Components by default; client only for interaction.
- Keep visible focus, keyboard support and reduced-motion behavior.
- All product UI text is English.
- Do not change 🔒 contract files unless explicitly allowed.

- Commit message: `T35: admin hosts timestamps`.
