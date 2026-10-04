# T38 — Final approved legal copy

## Prerequisite
T34 merged, and the user supplies final legal text that has been explicitly approved for publication.

## External blocker
Do not start this task without the approved source text. Do not draft, infer, reconcile or supplement legal language.

## Bug coverage
GV-002.

## Creates
- `app/(public)/terms/page.tsx`
- `app/(public)/privacy/page.tsx`
- `app/(public)/cookies/page.tsx`
- `app/(public)/content-removal/page.tsx`
- `app/(public)/content-removal/dmca/page.tsx`
- `app/(public)/content-removal/request/page.tsx`
- `app/(public)/content-removal/dmca/DMCAForm.tsx`
- `app/(public)/content-removal/request/RemovalRequestForm.tsx`

## Implement
- Replace only placeholder blocks covered by the supplied approved text.
- Preserve source terminology and section structure; do not add compliance claims.
- Keep routes, form behavior and accessibility from T34 unchanged unless the approved copy itself requires a label/section placement change within this scope.
- If approved copy is incomplete for a route/section, leave that placeholder and report the missing source text.

## Done when
- Every replaced legal passage is traceable to supplied approved text.
- No assistant-authored legal prose or compliance claim is introduced.
- Forms and legal navigation still pass T34/T37 regression tests.

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

- Commit message: `T38: final approved legal copy`.
