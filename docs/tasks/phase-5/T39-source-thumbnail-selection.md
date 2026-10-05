# T39 — Source thumbnails, host alternatives and Dood embed compatibility

## Prerequisite
T29 merged. This task is a production follow-up requested after the first real-video smoke test.

## Scope
- Make the migration CSV `thumbnail_url` the default thumbnail for migrated videos.
- Keep each linked mirror's host thumbnail available for review.
- Let an admin choose Source / DoodStream / VOE / EarnVids thumbnails from `/admin/review` when that source is available.
- Refresh Dood embed URLs without hardcoding the retired `dood.so` base.
- Do not change the locked Prisma schema or `lib/hosts/types.ts`.

## Creates
- `.github/workflows/video-migration.yml`
- `.env.example`
- `Caddyfile`
- `docker-compose.yml`
- `package.json`
- `README_TASKS.md`
- `docs/tasks/phase-5/T39-source-thumbnail-selection.md`
- `lib/hosts/dood.ts`
- `lib/hosts/dood.test.ts`
- `lib/hosts/voe.ts`
- `lib/hosts/voe.test.ts`
- `lib/sync/newVideos.ts`
- `lib/sync/match.ts`
- `lib/sync/healthCheck.ts`
- `lib/sync/thumbnailSources.ts`
- `lib/sync/thumbnailSources.test.ts`
- `scripts/apply-migration-thumbnails.ts`
- `scripts/apply-migration-thumbnails-ssh.sh`
- `scripts/video-migration/common.py`
- `scripts/video-migration/fanout_and_log.py`
- `app/admin/review/actions.ts`
- `app/admin/review/page.tsx`
- `app/admin/review/page.module.css`

## Implementation
- Store source-thumbnail URL and selected-thumbnail identity in namespaced `Setting` rows. Do not alter `prisma/schema.prisma`. Re-importing a source URL must never override a host thumbnail that an admin already selected.
- Download every selected/default image through the existing Sharp WebP media pipeline so public pages do not hotlink the migration source.
- Migration fanout emits a host-agnostic payload containing `postId`, `sourceThumbnailUrl`, and a map of host registry id to file code. The payload is regenerated from the merged migration log for the requested `start`/`limit` range so a production-apply retry does not require re-uploading completed videos.
- Rename VOE remote uploads to the migration title after they become ready so host-agnostic normalized-name matching remains stable across all three providers.
- Production receives that payload only through a dedicated restricted SSH key/forced command. The receiver validates payload size/shape, runs `sync:new`, then applies source thumbnails idempotently.
- Primary and secondary mirror sync keeps `Mirror.hostThumbnailUrl` current. VOE uses its documented storyboard URL convention because API v1 does not return an image field.
- Review queue shows only available thumbnail choices and uses server actions; Source remains selectable after choosing a host thumbnail.
- Dood embed base comes from `HOST_DOOD_EMBED_BASE`, defaulting to the current Dood video domain. Known rotating Dood domains remain in `embedDomains` so generated CSP permits them.
- Existing primary mirrors refresh embed URL and host metadata during `sync:new`; health sync refreshes embed URL as well.

## Done when
- A migrated video with CSV `thumbnail_url` receives a local `/media/*.webp` thumbnail and records Source as selected on first import; later manifest retries preserve an explicit admin host-thumbnail choice.
- Review queue can switch between Source and every linked host that has a thumbnail URL; switching never loses the Source option.
- Dood/VOE/EarnVids mirror thumbnails are retained when available.
- Existing Dood mirror embed URLs refresh away from the retired hardcoded `dood.so` base.
- Generated Caddy CSP includes the current Dood embed domain.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run caddy:check`, build and E2E CI are green.
- Production applies the nine smoke-test source thumbnails successfully and `sync:new` remains error-free.

## Commit
`T39: source thumbnail selection and Dood embed compatibility`
