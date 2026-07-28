#!/usr/bin/env bash
# Create, validate, checksum, and atomically publish a Patchwork PostgreSQL backup.

set -Eeuo pipefail
umask 077

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-patchwork}"
PGDATABASE="${PGDATABASE:-patchwork}"
BACKUP_DIR="${BACKUP_DIR:-/backups/patchwork}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
PATCHWORK_BACKUP_METRICS_FILE="${PATCHWORK_BACKUP_METRICS_FILE:-${BACKUP_DIR}/backup.prom}"
TIMESTAMP="$(date -u '+%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/${PGDATABASE}_${TIMESTAMP}.dump"
START_EPOCH="$(date +%s)"
TEMP_DIR=''

log() { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

atomic_write_metrics() {
    local success="$1" now temporary
    now="$(date +%s)"
    temporary="${PATCHWORK_BACKUP_METRICS_FILE}.tmp.$$"
    mkdir -p "$(dirname "$PATCHWORK_BACKUP_METRICS_FILE")"
    {
        printf '# TYPE patchwork_backup_last_attempt_success gauge\n'
        printf 'patchwork_backup_last_attempt_success{project="patchwork",environment="staging"} %s\n' "$success"
        printf '# TYPE patchwork_backup_last_attempt_timestamp_seconds gauge\n'
        printf 'patchwork_backup_last_attempt_timestamp_seconds{project="patchwork",environment="staging"} %s\n' "$now"
        if [[ "$success" == 1 ]]; then
            printf '# TYPE patchwork_backup_last_success_timestamp_seconds gauge\n'
            printf 'patchwork_backup_last_success_timestamp_seconds{project="patchwork",environment="staging"} %s\n' "$now"
        elif [[ -f "$PATCHWORK_BACKUP_METRICS_FILE" ]]; then
            grep 'patchwork_backup_last_success_timestamp_seconds' "$PATCHWORK_BACKUP_METRICS_FILE" || true
        fi
    } >"$temporary"
    mv "$temporary" "$PATCHWORK_BACKUP_METRICS_FILE"
}

cleanup() { [[ -z "$TEMP_DIR" ]] || rm -rf -- "$TEMP_DIR"; }
on_error() {
    local status=$?
    atomic_write_metrics 0 || true
    log "ERROR: backup failed with status ${status}; no archive was published."
    exit "$status"
}
trap cleanup EXIT
trap on_error ERR

for command in pg_dump pg_restore; do
    command -v "$command" >/dev/null 2>&1 || { log "ERROR: ${command} not found in PATH."; exit 1; }
done
if command -v sha256sum >/dev/null 2>&1; then
    sha256() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
    sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
else
    log 'ERROR: sha256sum or shasum is required.'
    exit 1
fi

mkdir -p "$BACKUP_DIR"
TEMP_DIR="$(mktemp -d "${BACKUP_DIR}/.backup.XXXXXX")"
TEMP_DUMP="${TEMP_DIR}/archive.dump"
log "Creating backup of ${PGDATABASE} on ${PGHOST}:${PGPORT}."
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -Fc -f "$TEMP_DUMP"
[[ -s "$TEMP_DUMP" ]]
pg_restore --list "$TEMP_DUMP" >/dev/null

CHECKSUM="$(sha256 "$TEMP_DUMP")"
SIZE="$(wc -c <"$TEMP_DUMP" | tr -d ' ')"
END_EPOCH="$(date +%s)"
DURATION="$((END_EPOCH - START_EPOCH))"
printf '%s  %s\n' "$CHECKSUM" "$(basename "$BACKUP_FILE")" >"${TEMP_DIR}/archive.sha256"
printf '{"created_at":"%s","database":"%s","size_bytes":%s,"sha256":"%s","duration_seconds":%s}\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$PGDATABASE" "$SIZE" "$CHECKSUM" "$DURATION" >"${TEMP_DIR}/archive.json"

mv "$TEMP_DUMP" "$BACKUP_FILE"
mv "${TEMP_DIR}/archive.sha256" "${BACKUP_FILE}.sha256"
mv "${TEMP_DIR}/archive.json" "${BACKUP_FILE}.json"
atomic_write_metrics 1
trap - ERR

find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name "${PGDATABASE}_*.dump" -o -name "${PGDATABASE}_*.dump.sha256" -o -name "${PGDATABASE}_*.dump.json" \) \
    -mtime "+${BACKUP_RETENTION_DAYS}" -delete
log "Published validated backup ${BACKUP_FILE} (${SIZE} bytes, ${DURATION}s)."
