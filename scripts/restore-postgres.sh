#!/usr/bin/env bash
# Restore a validated Patchwork archive into an explicitly empty database.

set -Eeuo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-patchwork}"
PGDATABASE="${PGDATABASE:-patchwork}"
SKIP_CONFIRM="${SKIP_CONFIRM:-no}"
REQUIRE_EMPTY_DATABASE="${REQUIRE_EMPTY_DATABASE:-yes}"
RESTORE_VERIFICATION_SQL="${RESTORE_VERIFICATION_SQL:-SELECT 1}"

log() { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
usage() { printf 'Usage: %s <backup.dump>\n' "$0" >&2; exit 1; }
[[ $# -eq 1 ]] || usage
BACKUP_FILE="$1"

for command in pg_restore psql; do
    command -v "$command" >/dev/null 2>&1 || { log "ERROR: ${command} not found in PATH."; exit 1; }
done
[[ -r "$BACKUP_FILE" && -s "$BACKUP_FILE" ]] || { log "ERROR: unreadable or empty backup: ${BACKUP_FILE}"; exit 2; }
pg_restore --list "$BACKUP_FILE" >/dev/null || { log 'ERROR: invalid pg_dump archive.'; exit 2; }

if [[ -f "${BACKUP_FILE}.sha256" ]]; then
    if command -v sha256sum >/dev/null 2>&1; then
        (cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "${BACKUP_FILE}.sha256")")
    else
        expected="$(awk '{print $1}' "${BACKUP_FILE}.sha256")"
        actual="$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')"
        [[ "$expected" == "$actual" ]] || { log 'ERROR: backup checksum mismatch.'; exit 2; }
    fi
fi

table_count="$(psql -XAt -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    -c "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');")"
if [[ "$REQUIRE_EMPTY_DATABASE" != yes || "$table_count" != 0 ]]; then
    log "ERROR: target must be an empty database and REQUIRE_EMPTY_DATABASE=yes (found ${table_count} user tables)."
    exit 3
fi

if [[ "$SKIP_CONFIRM" != yes ]]; then
    printf 'Restore into empty database %s on %s:%s? Type yes: ' "$PGDATABASE" "$PGHOST" "$PGPORT"
    read -r confirmation
    [[ "$confirmation" == yes ]] || { log 'Restore cancelled.'; exit 0; }
fi

START_EPOCH="$(date +%s)"
pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    --exit-on-error --no-owner --no-privileges "$BACKUP_FILE"

# Restored credentials are intentionally unusable. Durable private state and
# projections remain; users must complete OAuth again after a recovery.
psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<'SQL'
BEGIN;
DELETE FROM patchwork_browser_sessions;
DELETE FROM at_oauth_state;
DELETE FROM at_oauth_sessions;
COMMIT;
SQL

psql -XAt -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "$RESTORE_VERIFICATION_SQL" >/dev/null
session_count="$(psql -XAt -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c \
    'SELECT (SELECT count(*) FROM patchwork_browser_sessions) + (SELECT count(*) FROM at_oauth_sessions) + (SELECT count(*) FROM at_oauth_state);')"
[[ "$session_count" == 0 ]] || { log 'ERROR: restored sessions were not invalidated.'; exit 5; }

END_EPOCH="$(date +%s)"
DURATION="$((END_EPOCH - START_EPOCH))"
if stat -c %Y "$BACKUP_FILE" >/dev/null 2>&1; then
    backup_epoch="$(stat -c %Y "$BACKUP_FILE")"
else
    backup_epoch="$(stat -f %m "$BACKUP_FILE")"
fi
recovery_point_seconds="$((START_EPOCH - backup_epoch))"
printf '{"event":"restore","status":"success","database":"%s","duration_seconds":%s,"recovery_point_seconds":%s,"sessions_remaining":0}\n' \
    "$PGDATABASE" "$DURATION" "$recovery_point_seconds"
log "Restore verified in ${DURATION}s; recovery point age ${recovery_point_seconds}s."
