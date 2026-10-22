#!/usr/bin/env bash
# Proves a backup is usable: decrypts it, checks every sha256, restores the
# database into a throwaway PostgreSQL and compares the counts with the
# manifest. Used by the weekly workflow (with a one-off key) and by people
# holding the real age key.
#
#   scripts/backup/verify-backup.sh gayvideo-backup-<stamp>.tar.age <age identity file>
#
# Needs: age, tar, sha256sum, jq, and Docker (a postgres:<major>-alpine
# container is started and removed). Set VERIFY_PG_URL to restore into an
# existing EMPTY database with the local pg_restore/psql instead of Docker.
# Set KEEP_DIR=<dir> to keep the decrypted files there (they contain
# secrets: .env); by default they are deleted.
set -euo pipefail

backup="${1:?usage: verify-backup.sh <backup.tar.age> <age identity file>}"
identity="${2:?usage: verify-backup.sh <backup.tar.age> <age identity file>}"
for tool in age tar sha256sum jq; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done

umask 077
work="$(mktemp -d)"
container=""
cleanup() {
  if [ -n "$container" ]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi
  rm -rf "$work"
}
trap cleanup EXIT

echo "1/4 Decrypting"
age --decrypt --identity "$identity" --output "$work/bundle.tar" "$backup"
mkdir "$work/bundle"
tar -xf "$work/bundle.tar" -C "$work/bundle"
rm "$work/bundle.tar"
cd "$work/bundle"

echo "2/4 Checking sha256 of every file"
sha256sum --check --strict --quiet SHA256SUMS
for name in database.dump media.tar env; do
  listed="$(jq -r --arg n "$name" '.files[] | select(.name == $n) | .sha256' manifest.json)"
  actual="$(sha256sum "$name" | cut -d' ' -f1)"
  [ "$listed" = "$actual" ] || { echo "manifest sha256 mismatch for $name" >&2; exit 1; }
done
grep -q '^DATABASE_URL=' env || { echo "env has no DATABASE_URL line" >&2; exit 1; }
media_files="$(tar -tf media.tar | grep -vc '/$' || true)"
[ "$media_files" = "$(jq -r .media_files manifest.json)" ] \
  || { echo "media.tar has $media_files files, manifest says $(jq -r .media_files manifest.json)" >&2; exit 1; }

echo "3/4 Restoring the database into a throwaway PostgreSQL"
if [ -n "${VERIFY_PG_URL:-}" ]; then
  pg_restore --no-owner --exit-on-error --dbname "$VERIFY_PG_URL" database.dump
  query() { psql "$VERIFY_PG_URL" -Atc "$1"; }
else
  major="$(jq -r .postgres_version manifest.json | cut -d. -f1)"
  [[ "$major" =~ ^[0-9]+$ ]] || { echo "manifest has no postgres_version" >&2; exit 1; }
  container="gv-verify-$$"
  docker run -d --name "$container" -e POSTGRES_USER=gayvideo -e POSTGRES_PASSWORD=verify \
    -e POSTGRES_DB=gayvideo "postgres:${major}-alpine" >/dev/null
  # The image's init script restarts the server once; wait for the final one.
  for _ in $(seq 1 60); do
    if docker exec "$container" pg_isready -U gayvideo -d gayvideo -h 127.0.0.1 >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  sleep 2
  docker exec "$container" pg_isready -U gayvideo -d gayvideo -h 127.0.0.1 >/dev/null
  docker exec -i "$container" pg_restore -U gayvideo -d gayvideo --no-owner --exit-on-error \
    < database.dump
  query() { docker exec "$container" psql -U gayvideo -d gayvideo -Atc "$1"; }
fi

echo "4/4 Comparing with the manifest"
check() {
  local label="$1" sql="$2" key="$3" got want
  got="$(query "$sql")"
  want="$(jq -r ".$key" manifest.json)"
  [ "$got" = "$want" ] || { echo "$label: restored $got, manifest $want" >&2; exit 1; }
  echo "  $label: $got"
}
check videos 'SELECT count(*) FROM "Video"' videos
check "published videos" 'SELECT count(*) FROM "Video" WHERE "isPublished" AND NOT "isHidden"' published_videos
check "prisma migrations" 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL' prisma_migrations
echo "  media files: $media_files"

if [ -n "${KEEP_DIR:-}" ]; then
  mkdir -p "$KEEP_DIR"
  cp manifest.json SHA256SUMS database.dump media.tar env "$KEEP_DIR/"
  echo "Decrypted files kept in $KEEP_DIR (contains .env secrets: delete when done)"
fi

echo "BACKUP OK: $(jq -r '"\(.stamp), commit \(.commit[0:7]), \(.videos) videos"' manifest.json)"
