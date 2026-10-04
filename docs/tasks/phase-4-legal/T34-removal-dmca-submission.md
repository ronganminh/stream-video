# T34 — Removal/DMCA submission correctness

## Prerequisite
T29 merged.

## Bug coverage
GV-003, GV-011.

## Creates
- `app/(public)/content-removal/LegalShell.tsx`
- `app/(public)/content-removal/legal.module.css`
- `app/(public)/content-removal/forms.module.css`
- `app/(public)/content-removal/dmca/DMCAForm.tsx`
- `app/(public)/content-removal/dmca/page.tsx`
- `app/(public)/content-removal/request/RemovalRequestForm.tsx`
- `app/(public)/content-removal/request/page.tsx`
- `app/api/requests/route.ts`
- `app/api/requests/route.test.ts`

## Implement
- First verify actual submission/network behavior; the audit only observed DOM symptoms and did not submit a report.
- Submission must use POST/server processing; never put contact email or report details in the URL/history.
- Add necessary field names, labels, native hints plus server-side zod validation.
- Required fields, loading, success, error and duplicate-submit protection must work.
- Persist a valid test submission to the same RemovalRequest model consumed by Admin Requests.
- Make legal-page section navigation usable on mobile with clear overflow/disclosure affordance and keyboard support.
- Keep every legal prose/declaration block exactly `LEGAL COPY — FINAL TEXT REQUIRED`; do not write replacement legal text.

## Done when
- Network/E2E proves no PII appears in a GET URL.
- Invalid payloads fail server validation.
- Valid DMCA/removal payloads create the expected DB request.
- Mobile legal navigation is fully reachable at 390/320px.

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

- Commit message: `T34: removal dmca submission correctness`.
