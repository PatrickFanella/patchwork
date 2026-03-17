#!/bin/sh
# backup-postgres.sh -- Logical backup of the Patchwork Postgres database.
#
# Uses pg_dump in custom format (compressed) with configurable retention.
# Designed for cron scheduling; exit codes integrate with monitoring.
#
# Exit codes:
#   0 -- backup completed successfully
#   1 -- configuration or environment error
#   2 -- pg_dump failed
#   3 -- retention cleanup failed (backup itself succeeded)
#
# Environment variables:
#   PGHOST          -- Postgres host (default: localhost)
#   PGPORT          -- Postgres port (default: 5432)
#   PGUSER          -- Postgres user (default: patchwork)
#   PGDATABASE      -- database name  (default: patchwork)
#   PGPASSWORD      -- password (or use .pgpass / PGPASSFILE)
#   BACKUP_DIR      -- directory to store backups (default: /backups/patchwork)
#   BACKUP_RETENTION_DAYS -- days to keep old backups (default: 7)
#
# Usage:
#   ./scripts/backup-postgres.sh
#
# Tracks: #107

set -eu

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-patchwork}"
PGDATABASE="${PGDATABASE:-patchwork}"
BACKUP_DIR="${BACKUP_DIR:-/backups/patchwork}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

TIMESTAMP="$(date -u '+%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/${PGDATABASE}_${TIMESTAMP}.dump"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
    printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1"
}

log_json() {
    # Emit a structured JSON log line for monitoring integration.
    printf '{"timestamp":"%s","event":"backup","database":"%s","file":"%s","size_bytes":%s,"duration_seconds":%s,"status":"%s"}\n' \
        "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
        "$PGDATABASE" \
        "$1" \
        "$2" \
        "$3" \
        "$4"
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

if ! command -v pg_dump >/dev/null 2>&1; then
    log "ERROR: pg_dump not found in PATH."
    exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
    log "Creating backup directory: ${BACKUP_DIR}"
    mkdir -p "$BACKUP_DIR" || {
        log "ERROR: Failed to create backup directory."
        exit 1
    }
fi

# ---------------------------------------------------------------------------
# Execute backup
# ---------------------------------------------------------------------------

log "Starting backup of '${PGDATABASE}' on ${PGHOST}:${PGPORT} as ${PGUSER}."
log "Backup file: ${BACKUP_FILE}"

START_EPOCH="$(date +%s)"

if pg_dump \
    -h "$PGHOST" \
    -p "$PGPORT" \
    -U "$PGUSER" \
    -d "$PGDATABASE" \
    -Fc \
    -f "$BACKUP_FILE"; then

    END_EPOCH="$(date +%s)"
    DURATION="$((END_EPOCH - START_EPOCH))"

    # Get file size (portable across Linux and macOS).
    if [ -f "$BACKUP_FILE" ]; then
        FILE_SIZE="$(wc -c < "$BACKUP_FILE" | tr -d ' ')"
    else
        FILE_SIZE=0
    fi

    log "Backup completed successfully in ${DURATION}s (${FILE_SIZE} bytes)."
    log_json "$BACKUP_FILE" "$FILE_SIZE" "$DURATION" "success"
else
    END_EPOCH="$(date +%s)"
    DURATION="$((END_EPOCH - START_EPOCH))"
    log "ERROR: pg_dump failed after ${DURATION}s."
    log_json "$BACKUP_FILE" "0" "$DURATION" "failed"
    exit 2
fi

# ---------------------------------------------------------------------------
# Retention cleanup
# ---------------------------------------------------------------------------

log "Cleaning up backups older than ${BACKUP_RETENTION_DAYS} days."

# Use find to remove old dump files. Only delete files matching our naming
# pattern to avoid accidentally removing unrelated files.
CLEANUP_EXIT=0
find "$BACKUP_DIR" \
    -maxdepth 1 \
    -name "${PGDATABASE}_*.dump" \
    -type f \
    -mtime "+${BACKUP_RETENTION_DAYS}" \
    -print \
    -delete || CLEANUP_EXIT=$?

if [ "$CLEANUP_EXIT" -ne 0 ]; then
    log "WARNING: Retention cleanup encountered errors (exit ${CLEANUP_EXIT}). Backup itself succeeded."
    exit 3
fi

log "Backup and cleanup complete."
exit 0
