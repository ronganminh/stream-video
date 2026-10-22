#!/usr/bin/env bash
# Prints the backup files to delete so only the newest <keep> remain; see
# retention-lib.sh for exactly which names are considered.
#
#   rclone lsf gdrive: | scripts/backup/retention.sh 8
set -euo pipefail
# shellcheck source=scripts/backup/retention-lib.sh
. "$(dirname "$0")/retention-lib.sh"
stale_backups "${1:?usage: retention.sh <number of backups to keep>}"
