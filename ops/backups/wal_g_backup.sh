#!/usr/bin/env bash
set -euo pipefail

# WAL-G backup helper keeping 30 days of backups for PITR.
#
# Required environment variables:
#   - WALG_S3_PREFIX: destination (e.g. s3://asso-backups/postgres)
#   - PGHOST / PGPORT / PGUSER / PGPASSWORD: PostgreSQL connection info
#   - PGDATA: path to the PostgreSQL data directory (for tar backups)
#   - AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (or IAM role)
#
# Optional environment variables:
#   - WALG_DELTA_MAX_STEPS (defaults to 7)
#   - BACKUP_TYPE: "full" or "delta" (default: auto)
#
# The script triggers a base backup with WAL-G and prunes anything older than 30 days.

export WALG_DELTA_MAX_STEPS="${WALG_DELTA_MAX_STEPS:-7}"
export WALG_DOWNLOAD_CONCURRENCY="${WALG_DOWNLOAD_CONCURRENCY:-4}"
export WALG_UPLOAD_CONCURRENCY="${WALG_UPLOAD_CONCURRENCY:-4}"
BACKUP_TYPE="${BACKUP_TYPE:-}" # optional hint for wal-g backup-push

if [[ -z "${WALG_S3_PREFIX:-}" ]]; then
  echo "WALG_S3_PREFIX must be set (e.g. s3://asso-backups/postgres)" >&2
  exit 1
fi

if ! command -v wal-g >/dev/null 2>&1; then
  echo "wal-g binary not found in PATH" >&2
  exit 1
fi

# Run the backup. WAL-G automatically infers the type when BACKUP_TYPE is empty.
if [[ -n "${BACKUP_TYPE}" ]]; then
  wal-g backup-push --${BACKUP_TYPE} "${PGDATA}"
else
  wal-g backup-push "${PGDATA}"
fi

# Retention: delete backups strictly older than 30 days and their WAL segments.
wal-g delete before "$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)" --confirm
