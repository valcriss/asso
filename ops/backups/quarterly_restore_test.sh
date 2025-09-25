#!/usr/bin/env bash
set -euo pipefail

# Quarterly restoration drill for staging using pgBackRest or WAL-G backups.
#
# This job is intended to run from a staging bastion or CI runner with access to
# the backup repository. It restores the latest backup into a disposable staging
# database, runs a smoke test query, and hands the environment back to the
# application team for validation.
#
# Required environment variables:
#   - RESTORE_TOOL: "pgbackrest" or "wal-g" (defaults to pgbackrest)
#   - STAGING_PGDATA: destination path for the restored data directory
#   - STAGING_CONNECTION_URI: connection string to run smoke tests after restore
#
# pgBackRest-specific variables:
#   - PG_BACKREST_STANZA (default: asso)
#   - PG_BACKREST_CONFIG (default: /etc/pgbackrest/pgbackrest.conf)
#
# WAL-G-specific variables:
#   - WALG_S3_PREFIX
#   - PGUSER/PGPASSWORD/PGHOST/PGPORT for final vacuum/analyze steps
#
# Optional variables:
#   - SMOKE_TEST_QUERY (default: 'SELECT count(*) FROM pg_catalog.pg_tables;')
#   - PSQL (default: psql)
#
# Example crontab (run every quarter, first Sunday at 02:00 UTC):
#   0 2 1 JAN,APR,JUL,OCT * /opt/asso/ops/backups/quarterly_restore_test.sh >> /var/log/asso_restore.log 2>&1

RESTORE_TOOL="${RESTORE_TOOL:-pgbackrest}"
STAGING_PGDATA="${STAGING_PGDATA:?Set STAGING_PGDATA to the target data directory}"
SMOKE_TEST_QUERY="${SMOKE_TEST_QUERY:-SELECT count(*) FROM pg_catalog.pg_tables;}"
PSQL_BIN="${PSQL:-psql}"

prepare_staging_directory() {
  rm -rf "${STAGING_PGDATA}"
  mkdir -p "${STAGING_PGDATA}"
  chmod 700 "${STAGING_PGDATA}"
}

run_pgbackrest_restore() {
  local stanza config
  stanza="${PG_BACKREST_STANZA:-asso}"
  config="${PG_BACKREST_CONFIG:-/etc/pgbackrest/pgbackrest.conf}"

  pgbackrest --config="${config}" --stanza="${stanza}" \
    --delta --recovery-option=target-action=promote \
    --target="latest" --log-level-console=info \
    --pg1-path="${STAGING_PGDATA}" restore
}

run_walg_restore() {
  if [[ -z "${WALG_S3_PREFIX:-}" ]]; then
    echo "WALG_S3_PREFIX must be defined to use WAL-G restore" >&2
    exit 1
  fi

  export PGDATA="${STAGING_PGDATA}"
  wal-g backup-fetch "${STAGING_PGDATA}" LATEST
  wal-g wal-fetch "${STAGING_PGDATA}" LATEST || true
}

run_smoke_test() {
  local uri
  uri="${STAGING_CONNECTION_URI:?Set STAGING_CONNECTION_URI for smoke tests}"
  echo "Running smoke test query on restored database"
  echo "${SMOKE_TEST_QUERY}" | ${PSQL_BIN} "${uri}" --set ON_ERROR_STOP=1 >/tmp/restore_smoke.log
}

prepare_staging_directory

case "${RESTORE_TOOL}" in
  pgbackrest)
    run_pgbackrest_restore
    ;;
  wal-g)
    run_walg_restore
    ;;
  *)
    echo "Unsupported RESTORE_TOOL: ${RESTORE_TOOL}" >&2
    exit 1
    ;;
esac

run_smoke_test

echo "Restore drill completed successfully at $(date -Is)" >> /var/log/asso_restore_audit.log
