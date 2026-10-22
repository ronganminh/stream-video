# shellcheck shell=bash
# stale_backups <keep>: reads file names on stdin, prints the ones to delete so
# only the newest <keep> backups remain. Only names the backup workflow creates
# are ever printed:
#   gayvideo-backup-YYYYMMDDTHHMMSSZ.tar.age
#   gayvideo-backup-YYYYMMDDTHHMMSSZ.tar.age.sha256
# Anything else (README.md, files a person put there) is ignored.
# Sourced by retention.sh (runner) and sent with vps-keep.sh (VPS).
stale_backups() {
  local keep="${1:?keep count}"
  [[ "$keep" =~ ^[1-9][0-9]*$ ]] || { echo "keep must be a positive integer" >&2; return 1; }

  local pattern='^gayvideo-backup-([0-9]{8}T[0-9]{6}Z)\.tar\.age(\.sha256)?$'
  local names=() name stamp
  while IFS= read -r name; do
    [[ "$name" =~ $pattern ]] && names+=("$name")
  done
  [ "${#names[@]}" -gt 0 ] || return 0

  # Stamps sort chronologically as text; keep the newest <keep> distinct ones.
  local stale=()
  mapfile -t stale < <(
    printf '%s\n' "${names[@]}" | sed -E "s/$pattern/\\1/" | sort -u -r | tail -n "+$((keep + 1))"
  )
  for stamp in "${stale[@]}"; do
    for name in "${names[@]}"; do
      [[ "$name" == "gayvideo-backup-$stamp."* ]] && printf '%s\n' "$name"
    done
  done
  return 0
}
