#!/usr/bin/env bash
# Runs ON THE VPS (fed over SSH by .github/workflows/backup.yml):
#   ssh ... "bash -s -- <stamp>" < scripts/backup/remote-backup.sh > bundle.tar
#
# Writes ONE uncompressed tar to stdout and nothing else (logs go to stderr):
#   manifest.json  date, commit, counts, sizes, sha256 of every file below
#   SHA256SUMS     `sha256sum -c` format
#   database.dump  pg_dump --format=custom
#   media.tar      the media_data volume (/data/media: thumbnails)
#   env            the server's .env (secrets: the bundle is encrypted on
#                  the runner before it is stored anywhere)
# Fails (non-zero) on any error; the runner then discards the partial output.
set -euo pipefail

main() {
  local stamp="${1:?usage: remote-backup.sh <YYYYMMDDTHHMMSSZ>}"
  if ! [[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
    echo "invalid stamp: $stamp" >&2
    return 1
  fi

  # Keep the tar stream clean: everything else this script prints goes to
  # stderr; the bundle is written to the saved stdout (fd 3) at the end.
  exec 3>&1 1>&2
  umask 077
  cd "${APP_DIR:-/opt/gayvideo}"

  # As in deploy.yml: the user may need passwordless sudo for docker/.env/git.
  local sudo_cmd=""
  if ! docker info >/dev/null 2>&1; then
    if sudo -n docker info >/dev/null 2>&1; then
      sudo_cmd="sudo -n -E"
    else
      echo "$(whoami) cannot run docker, with or without passwordless sudo" >&2
      return 1
    fi
  fi
  dc() { $sudo_cmd docker compose "$@" </dev/null; }
  # $POSTGRES_* expand inside the postgres container, hence single quotes.
  # shellcheck disable=SC2016
  psql_value() {
    dc exec -T postgres sh -ec 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' sh "$1"
  }

  local work
  work="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$work'" EXIT

  echo "Dumping the database"
  # shellcheck disable=SC2016
  dc exec -T postgres sh -ec 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
    > "$work/database.dump"
  [ -s "$work/database.dump" ] || { echo "pg_dump produced an empty file" >&2; return 1; }

  echo "Archiving /data/media"
  dc exec -T worker tar -C /data -cf - media > "$work/media.tar"
  tar -tf "$work/media.tar" >/dev/null || { echo "media archive is unreadable" >&2; return 1; }

  echo "Copying .env"
  # sudo only to read a root-owned .env; the copy belongs to this user.
  # shellcheck disable=SC2024
  if [ -r .env ]; then cp .env "$work/env"; else sudo -n cat .env > "$work/env"; fi
  [ -s "$work/env" ] || { echo ".env is empty or missing" >&2; return 1; }

  local commit videos published migrations media_files pg_version
  commit="$(git rev-parse HEAD 2>/dev/null || sudo -n git rev-parse HEAD)"
  videos="$(psql_value 'SELECT count(*) FROM "Video"')"
  published="$(psql_value 'SELECT count(*) FROM "Video" WHERE "isPublished" AND NOT "isHidden"')"
  migrations="$(psql_value 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
  pg_version="$(psql_value 'SHOW server_version')"
  media_files="$(tar -tf "$work/media.tar" | grep -vc '/$' || true)"
  for value in "$videos" "$published" "$migrations" "$media_files"; do
    [[ "$value" =~ ^[0-9]+$ ]] || { echo "unexpected count: $value" >&2; return 1; }
  done

  (cd "$work" && sha256sum database.dump media.tar env > SHA256SUMS)
  local file_entries="" name bytes sum
  while read -r sum name; do
    bytes="$(stat -c %s "$work/$name")"
    file_entries+="${file_entries:+,}
    {\"name\": \"$name\", \"bytes\": $bytes, \"sha256\": \"$sum\"}"
  done < "$work/SHA256SUMS"

  cat > "$work/manifest.json" <<JSON
{
  "format": 1,
  "stamp": "$stamp",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "host": "$(hostname)",
  "commit": "$commit",
  "postgres_version": "$pg_version",
  "videos": $videos,
  "published_videos": $published,
  "prisma_migrations": $migrations,
  "media_files": $media_files,
  "files": [$file_entries
  ]
}
JSON

  echo "Bundle ready: videos=$videos published=$published media_files=$media_files commit=${commit:0:7}"
  tar -C "$work" -cf - manifest.json SHA256SUMS database.dump media.tar env >&3
}

main "$@" </dev/null
