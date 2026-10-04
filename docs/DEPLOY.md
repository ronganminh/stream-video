# Production deployment

This repository deploys with Docker Compose. The production stack is `postgres`, `web`, `worker`, and `caddy`. Caddy terminates HTTPS and serves `/media`; the worker writes downloaded thumbnails to the shared `media_data` volume through `MEDIA_DIR=/data/media`.

## 1. Prepare the VPS

Use a Linux VPS with a public IPv4/IPv6 address. Point the DNS A/AAAA records for the production hostname at the VPS before starting Caddy.

On Ubuntu/Debian, install Git and Docker Engine with the Compose plugin, then verify both commands are available:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker version
docker compose version
```

Allow SSH plus HTTP/HTTPS. UDP 443 is used by Caddy for HTTP/3:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw --force enable
```

Clone the repository at the path used by the supplied backup cron:

```bash
sudo mkdir -p /opt/gayvideo
sudo chown "$USER":"$USER" /opt/gayvideo
git clone https://github.com/ronganminh/stream-video.git /opt/gayvideo
cd /opt/gayvideo
git checkout main
```

## 2. Configure production environment

Create the runtime environment file:

```bash
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

Edit `.env`. Use the first generated value as `POSTGRES_PASSWORD` and put the same URL-safe value into both database URLs. Use the second value as `ADMIN_SESSION_SECRET`. Set `SITE_DOMAIN` to the real hostname and add the enabled provider API keys.

The runtime `DATABASE_URL` must use the Compose service hostname `postgres`:

```text
postgresql://gayvideo:YOUR_URL_SAFE_PASSWORD@postgres:5432/gayvideo?schema=public
```

The build-only `BUILD_DATABASE_URL` must point to the PostgreSQL port published on VPS loopback:

```text
postgresql://gayvideo:YOUR_URL_SAFE_PASSWORD@127.0.0.1:5432/gayvideo?schema=public
```

The web image uses `BUILD_DATABASE_URL` only as a BuildKit secret while Next.js prerenders database-backed states. It is not copied into the final image. Runtime web and worker containers use `DATABASE_URL`; do not replace its `postgres` hostname with `localhost`.

Load the deployment variables into the current shell before Compose validation/builds so the BuildKit secret source is available:

```bash
set -a
. ./.env
set +a
```

## 3. Validate deployment artifacts

The committed `Caddyfile` is generated from `Caddyfile.template` and `lib/hosts/registry.ts`. When provider `embedDomains` change, run `npm run caddy:generate` during development and commit the regenerated file. CI runs `npm run caddy:check` and fails on drift.

On the VPS, validate Compose and the committed Caddy syntax, then build the worker image first. The worker image is needed to run production migrations before the web image can prerender against the database.

```bash
docker compose config --quiet
docker run --rm \
  -e SITE_DOMAIN="$SITE_DOMAIN" \
  -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
docker compose build worker
```

## 4. Start PostgreSQL, migrate, and build the web image

```bash
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U gayvideo -d gayvideo; do sleep 2; done
docker compose run --rm worker ./node_modules/.bin/prisma migrate deploy
docker compose build web
```

The web build uses the already-exported `BUILD_DATABASE_URL` as a BuildKit secret and `network: host` only for its build stage, allowing Next.js prerendering to read the migrated database through the VPS loopback port. The final web image contains neither that secret nor host networking.

Do not run `npm run db:seed` in production; the seed is deterministic QA data.

### Initialize host rows on a fresh database

The host registry is code, while the primary host is a database setting. On a brand-new production database, insert the registry host rows once and choose the initial primary in the database. Set `PRIMARY_HOST_ID` to one of `dood`, `voe`, or `earnvids`; this is an operator choice, not application logic.

```bash
export PRIMARY_HOST_ID=voe
docker compose exec -T postgres psql -U gayvideo -d gayvideo -v primary_host="$PRIMARY_HOST_ID" <<'SQL'
INSERT INTO "Host" (id, label, enabled, "isPrimary", "sortOrder") VALUES
  ('dood', 'DoodStream', true, false, 10),
  ('voe', 'VOE', true, false, 20),
  ('earnvids', 'EarnVids', true, false, 30)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  enabled = EXCLUDED.enabled,
  "sortOrder" = EXCLUDED."sortOrder";

UPDATE "Host"
SET "isPrimary" = (id = :'primary_host');
SQL
```

After the admin UI is available, primary-host changes must be made through the Hosts setting; no application code hardcodes the primary.

## 5. Create the first admin

Use a password of at least 12 characters:

```bash
docker compose run --rm worker npm run admin:create -- admin@example.com 'REPLACE_WITH_A_STRONG_PASSWORD'
```

## 6. Start the application

```bash
docker compose up -d worker web caddy
docker compose ps
```

The first Caddy start obtains and renews HTTPS certificates automatically. DNS must already point to the VPS and ports 80/443 must be reachable.

### Media volume permissions

The worker image pre-creates `/data/media` for its non-root application user; Docker initializes the named `media_data` volume from that directory. Caddy mounts the same volume read-only at `/srv/media`.

Verify the worker can write to the volume:

```bash
docker compose run --rm worker sh -lc 'test -w "$MEDIA_DIR" && touch "$MEDIA_DIR/.write-test" && rm "$MEDIA_DIR/.write-test"'
```

## 7. Verify provider API keys

Run one host-agnostic NEW sync after host rows and API keys are configured. It reads the primary host from the database and also indexes enabled secondary providers:

```bash
docker compose run --rm worker npm run sync:new
docker compose run --rm worker npm run sync:health
```

If a configured key is missing or rejected, the command/SyncRun reports the provider error. Do not put API keys in the repository or shell history.

## 8. Post-deploy health checks

Run all of these after deployment. Reload the environment first if this is a new shell:

```bash
set -a
. ./.env
set +a
docker compose ps
docker compose exec -T postgres pg_isready -U gayvideo -d gayvideo
docker compose logs --tail=100 worker
docker compose logs --tail=100 web
docker compose logs --tail=100 caddy
curl -fsS "https://$SITE_DOMAIN/robots.txt" >/dev/null
curl -fsSI "https://$SITE_DOMAIN/" | grep -i '^content-security-policy:'
curl -fsSI "https://$SITE_DOMAIN/" | grep -i '^strict-transport-security:'
```

`docker compose ps` should show healthy `postgres`, `web`, `worker`, and `caddy`. The CSP header must contain the generated provider frame sources from the current host registry.

## 9. Daily database backup

`scripts/backup.sh` creates a PostgreSQL custom-format dump and deletes dumps older than the configured retention window. The supplied cron runs daily at 03:15 UTC and keeps 14 days.

Install it:

```bash
sudo install -d -m 700 /var/backups/gayvideo
sudo cp ops/backup/gayvideo-backup.cron /etc/cron.d/gayvideo-backup
sudo chmod 0644 /etc/cron.d/gayvideo-backup
sudo /bin/bash /opt/gayvideo/scripts/backup.sh
sudo ls -lh /var/backups/gayvideo
```

To run a backup somewhere else:

```bash
BACKUP_DIR=/mnt/backups BACKUP_RETENTION_DAYS=14 /bin/bash scripts/backup.sh
```

Backups contain application data. Protect the backup directory with VPS filesystem permissions and include it in the operator's off-host backup plan.

## 10. Restore a database backup

Choose a dump, stop application writers, recreate the database, restore, then re-run migrations:

```bash
cd /opt/gayvideo
export BACKUP=/var/backups/gayvideo/postgres-YYYYMMDDTHHMMSSZ.dump
docker compose stop web worker
docker compose exec -T postgres sh -ec 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"; createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
cat "$BACKUP" | docker compose exec -T postgres sh -ec 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error'
docker compose run --rm worker ./node_modules/.bin/prisma migrate deploy
docker compose up -d worker web
docker compose ps
```

Run the post-deploy health checks again after a restore.

## 11. Upgrade an existing VPS

Build the new worker first, migrate with it, then build the database-aware web image:

```bash
cd /opt/gayvideo
git fetch origin
git checkout main
git pull --ff-only origin main
set -a
. ./.env
set +a
docker compose config --quiet
docker compose build worker
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U gayvideo -d gayvideo; do sleep 2; done
docker compose run --rm worker ./node_modules/.bin/prisma migrate deploy
docker compose build web
docker compose up -d worker web caddy
docker compose ps
```

Keep the previous database backup until the new release has passed the health checks.

## CI versus real VPS validation

T29 does not require connected VPS credentials to merge. GitHub Actions builds both production images, validates Compose, verifies generated Caddy/CSP drift and Caddy syntax, then runs typecheck, lint, Vitest, production Next build, and Playwright E2E. The commands above are the required release checks when deploying to a real VPS.
