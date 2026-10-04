# PostgreSQL backup scheduler

The production backup is a daily PostgreSQL custom-format dump with a 14-day retention window.

Install the supplied cron definition on the VPS:

1. Keep the repository at `/opt/gayvideo`.
2. Create the backup directory with `sudo install -d -m 700 /var/backups/gayvideo`.
3. Copy `ops/backup/gayvideo-backup.cron` to `/etc/cron.d/gayvideo-backup`.
4. Set mode `0644` on the cron file.
5. Run `sudo /bin/bash /opt/gayvideo/scripts/backup.sh` once and verify a non-empty `postgres-*.dump` file exists.

The cron entry runs at 03:15 UTC. Override `BACKUP_DIR`, `BACKUP_RETENTION_DAYS` or `COMPOSE_FILE` when invoking `scripts/backup.sh` if the VPS layout differs.

Restore commands are documented in `docs/DEPLOY.md`.
