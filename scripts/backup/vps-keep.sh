# shellcheck shell=bash
# Runs ON THE VPS after retention-lib.sh (the workflow sends both):
#   cat retention-lib.sh vps-keep.sh | ssh ... "bash -s -- <dir> <keep> <name>..."
# Moves the uploaded files from ~/ into <dir> (sudo if needed) and deletes the
# backups beyond the newest <keep>. Only workflow-made names are touched.
set -euo pipefail

vps_keep() {
  local dir="$1" keep="$2" name sudo_cmd=""
  shift 2
  if ! { mkdir -p "$dir" 2>/dev/null && [ -w "$dir" ]; }; then
    sudo_cmd="sudo -n"
    $sudo_cmd install -d -m 700 "$dir"
  fi
  chmod 700 "$dir" 2>/dev/null || $sudo_cmd chmod 700 "$dir"

  for name in "$@"; do
    [[ "$name" =~ ^gayvideo-backup-[0-9]{8}T[0-9]{6}Z\.tar\.age(\.sha256)?$ ]] \
      || { echo "refusing unexpected name: $name" >&2; return 1; }
    $sudo_cmd mv "$HOME/$name.upload" "$dir/$name"
  done

  $sudo_cmd ls -1 "$dir" | stale_backups "$keep" | while IFS= read -r name; do
    echo "Removing old VPS backup $name"
    $sudo_cmd rm -f -- "$dir/$name"
  done
  echo "VPS backups in $dir:"
  $sudo_cmd ls -lh "$dir" | sed 's/^/  /'
}

vps_keep "$@" </dev/null
