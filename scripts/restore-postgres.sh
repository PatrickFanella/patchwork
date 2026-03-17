#!/bin/sh
# restore-postgres.sh -- Restore a Patchwork Postgres database from a pg_dump backup.
#
# Takes a backup file path as input, validates it, optionally creates a
# safety backup of the current database, and restores the specified dump.
#
# Exit codes:
#   0 -- restore completed successfully
#   1 -- usage or configuration error
#   2 -- backup file validation failed
#   3 -- safety backup of current database failed
#   4 -- pg_restore failed
#
# Environment variables:
#   PGHOST          -- Postgres host (default: localhost)
#   PGPORT          -- Postgres port (default: 5432)
#   PGUSER          -- Postgres user (default: patchwork)
#   PGDATABASE      -- database name  (default: patchwork)
#   PGPASSWORD      -- password (or use .pgpass / PGPASSFILE)
#   BACKUP_DIR      -- directory for safety backups (default: /backups/patchwork)
#   SKIP_CONFIRM    -- set to "yes" to skip the confirmation prompt
#   SKIP_SAFETY_BACKUP -- set to "yes" to skip the pre-restore safety backup
#
# Usage:
#   ./scripts/restore-postgres.sh <path-to-backup-file.dump>
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
SKIP_CONFIRM="${SKIP_CONFIRM:-no}"
SKIP_SAFETY_BACKUP="${SKIP_SAFETY_BACKUP:-no}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
    printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1"
}

log_json() {
    # Emit a structured JSON log line for monitoring integration.
    printf '{"timestamp":"%s","event":"restore","database":"%s","source_file":"%s","duration_seconds":%s,"status":"%s"}\n' \
        "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
        "$PGDATABASE" \
        "$1" \
        "$2" \
        "$3"
}

usage() {
    printf 'Usage: %s <path-to-backup-file.dump>\n' "$0"
    printf '\nRestores a Patchwork Postgres database from a pg_dump custom-format backup.\n'
    printf '\nOptions (via environment variables):\n'
    printf '  SKIP_CONFIRM=yes       Skip the interactive confirmation prompt.\n'
    printf '  SKIP_SAFETY_BACKUP=yes Skip creating a safety backup before restore.\n'
    exit 1
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

if [ $# -lt 1 ]; then
    usage
fi

BACKUP_FILE="$1"

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

if ! command -v pg_restore >/dev/null 2>&1; then
    log "ERROR: pg_restore not found in PATH."
    exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
    log "ERROR: pg_dump not found in PATH."
    exit 1
fi

# ---------------------------------------------------------------------------
# Validate backup file
# ---------------------------------------------------------------------------

if [ ! -f "$BACKUP_FILE" ]; then
    log "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 2
fi

if [ ! -r "$BACKUP_FILE" ]; then
    log "ERROR: Backup file is not readable: ${BACKUP_FILE}"
    exit 2
fi

# Check that the file is non-empty.
FILE_SIZE="$(wc -c < "$BACKUP_FILE" | tr -d ' ')"
if [ "$FILE_SIZE" -eq 0 ]; then
    log "ERROR: Backup file is empty: ${BACKUP_FILE}"
    exit 2
fi

# Validate the file is a valid pg_dump custom-format archive by checking
# the table of contents. pg_restore --list will exit non-zero if the file
# is not a valid archive.
if ! pg_restore --list "$BACKUP_FILE" >/dev/null 2>&1; then
    log "ERROR: Backup file does not appear to be a valid pg_dump custom-format archive."
    log "File: ${BACKUP_FILE} (${FILE_SIZE} bytes)"
    exit 2
fi

log "Backup file validated: ${BACKUP_FILE} (${FILE_SIZE} bytes)"

# ---------------------------------------------------------------------------
# Confirmation prompt
# ---------------------------------------------------------------------------

if [ "$SKIP_CONFIRM" != "yes" ]; then
    printf '\n'
    printf '  WARNING: This will DROP and recreate the "%s" database on %s:%s.\n' \
        "$PGDATABASE" "$PGHOST" "$PGPORT"
    printf '  Backup source: %s\n' "$BACKUP_FILE"
    printf '\n'
    printf '  Type "yes" to proceed: '
    read -r CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        log "Restore cancelled by user."
        exit 0
    fi
fi

# ---------------------------------------------------------------------------
# Safety backup of current database
# ---------------------------------------------------------------------------

if [ "$SKIP_SAFETY_BACKUP" != "yes" ]; then
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
    fi

    SAFETY_FILE="${BACKUP_DIR}/${PGDATABASE}_pre_restore_$(date -u '+%Y%m%d_%H%M%S').dump"
    log "Creating safety backup of current database: ${SAFETY_FILE}"

    if pg_dump \
        -h "$PGHOST" \
        -p "$PGPORT" \
        -U "$PGUSER" \
        -d "$PGDATABASE" \
        -Fc \
        -f "$SAFETY_FILE" 2>/dev/null; then
        SAFETY_SIZE="$(wc -c < "$SAFETY_FILE" | tr -d ' ')"
        log "Safety backup created: ${SAFETY_FILE} (${SAFETY_SIZE} bytes)"
    else
        log "ERROR: Failed to create safety backup. Aborting restore."
        log "If the current database is already lost, set SKIP_SAFETY_BACKUP=yes to proceed."
        exit 3
    fi
else
    log "Skipping safety backup (SKIP_SAFETY_BACKUP=yes)."
fi

# ---------------------------------------------------------------------------
# Execute restore
# ---------------------------------------------------------------------------

log "Starting restore of '${PGDATABASE}' from ${BACKUP_FILE}."

START_EPOCH="$(date +%s)"

# Use pg_restore with --clean to drop existing objects before recreating them,
# and --if-exists to avoid errors if objects do not exist yet.
if pg_restore \
    -h "$PGHOST" \
    -p "$PGPORT" \
    -U "$PGUSER" \
    -d "$PGDATABASE" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    "$BACKUP_FILE"; then

    END_EPOCH="$(date +%s)"
    DURATION="$((END_EPOCH - START_EPOCH))"
    log "Restore completed successfully in ${DURATION}s."
    log_json "$BACKUP_FILE" "$DURATION" "success"
else
    END_EPOCH="$(date +%s)"
    DURATION="$((END_EPOCH - START_EPOCH))"
    log "ERROR: pg_restore failed after ${DURATION}s."
    log_json "$BACKUP_FILE" "$DURATION" "failed"
    log "The safety backup (if created) is available at: ${SAFETY_FILE:-N/A}"
    exit 4
fi

# ---------------------------------------------------------------------------
# Post-restore verification hint
# ---------------------------------------------------------------------------

log "Restore complete. Verify the database state:"
log "  1. Check connectivity: pg_isready -h ${PGHOST} -p ${PGPORT} -U ${PGUSER} -d ${PGDATABASE}"
log "  2. Check table counts and data freshness (see docs/operations/disaster-recovery.md section 5)."
log "  3. Restart dependent services and verify health endpoints."

exit 0
