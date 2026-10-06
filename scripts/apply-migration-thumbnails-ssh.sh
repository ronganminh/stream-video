#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/gayvideo"
MAX_BYTES=$((2 * 1024 * 1024))
PAYLOAD="$(mktemp)"
trap 'rm -f "$PAYLOAD"' EXIT

cat > "$PAYLOAD"

size="$(wc -c < "$PAYLOAD" | tr -d ' ')"
if [[ "$size" -gt "$MAX_BYTES" ]]; then
  echo "Thumbnail payload is too large." >&2
  exit 1
fi

python3 - "$PAYLOAD" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)

if not isinstance(payload, list) or len(payload) > 1000:
    raise SystemExit("Invalid thumbnail payload.")

for item in payload:
    if not isinstance(item, dict):
        raise SystemExit("Invalid thumbnail payload item.")
    if set(item) != {"postId", "sourceThumbnailUrl", "mirrors"}:
        raise SystemExit("Unexpected thumbnail payload fields.")
    if not isinstance(item["postId"], str) or not item["postId"]:
        raise SystemExit("Invalid postId.")
    if not isinstance(item["sourceThumbnailUrl"], str):
        raise SystemExit("Invalid sourceThumbnailUrl.")
    if not item["sourceThumbnailUrl"].startswith(("https://", "http://")):
        raise SystemExit("Invalid source thumbnail scheme.")
    mirrors = item["mirrors"]
    if not isinstance(mirrors, dict) or not mirrors:
        raise SystemExit("Invalid mirrors object.")
    for host_id, file_code in mirrors.items():
        if (
            not isinstance(host_id, str)
            or not host_id
            or not isinstance(file_code, str)
            or not file_code
        ):
            raise SystemExit("Invalid mirror mapping.")
PY

cd "$APP_DIR"

# Refresh the migration CSVs from the data repo so sync:new sees the latest
# videos.csv / migration-log.csv (and their tags). Best-effort: if the pull
# fails we still sync with whatever is already checked out.
if [[ -d "$APP_DIR/migration-data/.git" ]]; then
  git config --global --add safe.directory "$APP_DIR/migration-data" || true
  git -C "$APP_DIR/migration-data" pull --ff-only --quiet \
    || echo "migration-data pull failed; using existing checkout." >&2
fi

# Attach source tags during import when the migration CSVs are present. The
# worker mounts ./migration-data at /app/migration-data (read-only), so the
# sync reads the in-container paths. When the data is absent the sync still
# runs, just without tag metadata.
sync_env=()
if [[ -f "$APP_DIR/migration-data/videos.csv" && -f "$APP_DIR/migration-data/migration-log.csv" ]]; then
  sync_env+=(-e MIGRATION_VIDEOS_CSV=/app/migration-data/videos.csv)
  sync_env+=(-e MIGRATION_LOG_CSV=/app/migration-data/migration-log.csv)
fi

run_sync() {
  docker compose run --rm "${sync_env[@]+"${sync_env[@]}"}" worker npm run sync:new </dev/null
}

# Per T39 the receiver runs sync:new first, then applies source thumbnails.
# An empty payload is a sync-only request.
if [[ "$(cat "$PAYLOAD")" == "[]" ]]; then
  run_sync
  echo "No source thumbnails to apply."
  exit 0
fi

for attempt in 1 2 3 4 5; do
  run_sync

  set +e
  cat "$PAYLOAD"     | docker compose exec -T worker npm run migration:thumbnails
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    exit 0
  fi

  if [[ "$status" -ne 2 || "$attempt" -eq 5 ]]; then
    exit "$status"
  fi

  sleep 30
done
