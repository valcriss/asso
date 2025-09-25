#!/usr/bin/env bash
set -euo pipefail

# pgBackRest backup launcher for the Association Management SaaS.
#
# This script orchestrates daily PostgreSQL backups with a 30-day retention policy
# leveraging pgBackRest's time-based retention. It expects the pgBackRest
# configuration to declare a stanza matching the value supplied via the
# PG_BACKREST_STANZA environment variable (defaults to "asso").
#
# Required environment variables:
#   - PGHOST / PGPORT / PGUSER / PGPASSWORD: connection parameters for the
#     PostgreSQL instance to back up.
#   - PG_BACKREST_STANZA: name of the stanza (default: "asso").
#   - PG_BACKREST_CONFIG: path to the pgBackRest configuration file
#     (default: /etc/pgbackrest/pgbackrest.conf).
#
# Optional environment variables:
#   - BACKUP_TYPE: one of "full", "diff", "incr" (default: automatic). When
#     omitted the script lets pgBackRest pick the optimal strategy based on the
#     configured schedule.
#   - LOG_LEVEL: overrides pgBackRest log level (default: info).
#
# The referenced pgBackRest configuration should include entries similar to:
#
# [global]
# repo1-type=s3
# repo1-s3-bucket=${PG_BACKREST_BUCKET}
# repo1-s3-endpoint=${S3_ENDPOINT}
# repo1-path=/pgbackrest
# repo1-retention-full-type=time
# repo1-retention-full=30
# repo1-retention-archive-type=time
# repo1-retention-archive=30
# log-level-console=${LOG_LEVEL:-info}
# process-max=4
#
# [${PG_BACKREST_STANZA:-asso}]
# pg1-path=/var/lib/postgresql/data
#
# Ensure that WAL archiving is enabled in postgresql.conf:
#   archive_mode = on
#   archive_command = 'pgbackrest --stanza=${PG_BACKREST_STANZA} archive-push %p'

PG_BACKREST_STANZA="${PG_BACKREST_STANZA:-asso}"
PG_BACKREST_CONFIG="${PG_BACKREST_CONFIG:-/etc/pgbackrest/pgbackrest.conf}"
BACKUP_TYPE="${BACKUP_TYPE:-}" # optional
LOG_LEVEL="${LOG_LEVEL:-info}"

if [[ ! -f "${PG_BACKREST_CONFIG}" ]]; then
  echo "pgBackRest configuration not found at ${PG_BACKREST_CONFIG}" >&2
  exit 1
fi

# Sanity check: ensure pgBackRest can reach the repository before launching the backup.
pgbackrest --config="${PG_BACKREST_CONFIG}" --stanza="${PG_BACKREST_STANZA}" \
  --log-level-console="${LOG_LEVEL}" info >/dev/null

PG_BACKUP_ARGS=("--config=${PG_BACKREST_CONFIG}" "--stanza=${PG_BACKREST_STANZA}" "--log-level-console=${LOG_LEVEL}")
if [[ -n "${BACKUP_TYPE}" ]]; then
  PG_BACKUP_ARGS+=("--type=${BACKUP_TYPE}")
fi

pgbackrest "${PG_BACKUP_ARGS[@]}" backup
