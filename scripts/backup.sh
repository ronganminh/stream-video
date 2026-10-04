#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/gayvideo}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

if ! [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || [[ "$BACKUP_RETENTION_DAYS" -lt 1 ]]; then
  echo "BACKUP_RETENTION_DAYS must be a positive integer." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
filename="postgres-${timestamp}.dump"
temporary="${BACKUP_DIR}/.${filename}.tmp"
destination="${BACKUP_DIR}/${filename}"

cleanup() {
  rm -f "$temporary"
}
trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" exec -T postgres sh -ec   'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'   > "$temporary"

if [[ ! -s "$temporary" ]]; then
  echo "Backup failed: pg_dump produced an empty file." >&2
  exit 1
fi

mv "$temporary" "$destination"
trap - EXIT

find "$BACKUP_DIR"   -type f   -name 'postgres-*.dump'   -mmin "+$((BACKUP_RETENTION_DAYS * 1440))"   -delete

echo "Backup written to $destination"
