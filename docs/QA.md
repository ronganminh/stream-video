# QA — T28

## Automated gate

GitHub Actions is the source of truth for T28. The verify job:

1. installs dependencies;
2. starts PostgreSQL 16;
3. runs Prisma migrations;
4. seeds deterministic QA records;
5. runs TypeScript, ESLint and Vitest;
6. builds the production Next.js app;
7. installs Chromium with Playwright dependencies;
8. starts the production build through Playwright webServer;
9. runs the E2E suite with one worker;
10. uploads Playwright report, trace and screenshots when the job fails;
11. tears PostgreSQL down.

The deterministic admin login used only by the QA seed is:

- email: admin@gayvideo.test
- password: e2e-admin-password

## E2E coverage

### Public desktop journey

- age gate opens and traps keyboard focus;
- Home renders after acknowledgement;
- desktop search submits to results;
- a result opens Watch;
- player mounts only after Play;
- server 2 can be selected;
- a related video opens;
- Watch breadcrumb reaches a category;
- category duration filtering updates the URL;
- primary navigation reaches Hot and Home.

### Mobile journey

- 390px mobile header/search dialog;
- search submission;
- results to Watch navigation.

### Report

- Watch Report action opens the modal;
- reason selection and details step;
- report API submission;
- success state returns a reference.

### Pagination

- Load More appends videos and updates the public URL;
- a JavaScript-disabled browser can directly render ?page=2;
- crawlable Previous/page-number/Next links remain in the HTML fallback.

### Admin

One deterministic mutation flow runs in order:

1. approve and publish Draft Seed Video;
2. manually link the seeded unmatched VOE HostFile;
3. change primary host from DoodStream to VOE and confirm the change.

### HTTP status behavior

- REMOVED Watch: HTTP 410;
- BLOCKED Watch: HTTP 410;
- unpublished draft Watch: HTTP 404;
- hidden Watch: HTTP 404.

## Responsive checks

Playwright checks Home, Latest and Watch at:

- 1440
- 1280
- 1024
- 768
- 390
- 375
- 360
- 320

For every width, document scroll width must not exceed the viewport. At 320px, the Latest video grid is explicitly verified as one column.

## Accessibility checks

@axe-core/playwright scans core Home, Latest, Search and Watch states plus the Report dialog. T28 fails on any serious or critical axe violation.

Keyboard checks cover:

- age gate initial focus and Tab loop;
- desktop search keyboard shortcut and Escape;
- Report opening via keyboard, dialog focus, Escape close and focus return.

## Failure artifacts

On an E2E failure, GitHub Actions retains:

- Playwright HTML report;
- traces for failed/retried tests;
- failure screenshots.

Known defects must not be waived in this document. A discovered non-locked integration or accessibility defect is fixed on the T28 branch and the gate rerun.
