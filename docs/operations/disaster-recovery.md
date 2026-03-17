# Disaster Recovery Runbook

Tracks: #107 (Backup, restore, and DR drills), #75 (Epic D -- Reliability & Observability)

---

## 1. Recovery Objectives

| Metric | Target | Rationale |
|--------|--------|-----------|
| **RTO** (Recovery Time Objective) | < 1 hour | Maximum acceptable downtime from incident detection to service restoration |
| **RPO** (Recovery Point Objective) | < 15 minutes | Maximum acceptable data loss measured from the point of failure |

---

## 2. Backup Strategy

### 2.1 Postgres Logical Backups (pg_dump)

Logical backups provide a portable, human-readable dump of the database that
can be restored to any compatible Postgres instance.

| Parameter | Value |
|-----------|-------|
| Tool | `pg_dump` (custom format, compressed) |
| Schedule | Every 6 hours via cron or orchestrator |
| Retention | 7 days (configurable via `BACKUP_RETENTION_DAYS`) |
| Storage | Local backup directory + off-site copy (S3, GCS, or equivalent) |
| Script | `scripts/backup-postgres.sh` |

**Cron example** (every 6 hours):

```cron
0 */6 * * * /path/to/scripts/backup-postgres.sh >> /var/log/patchwork-backup.log 2>&1
```

### 2.2 Postgres WAL Archiving (Continuous)

WAL (Write-Ahead Log) archiving enables point-in-time recovery (PITR) with
data loss limited to the last few seconds.

**Postgres configuration** (`postgresql.conf`):

```ini
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /backups/wal/%f && cp %p /backups/wal/%f'
archive_timeout = 300
```

| Parameter | Value |
|-----------|-------|
| WAL level | `replica` |
| Archive interval | 5 minutes (`archive_timeout = 300`) |
| Archive destination | `/backups/wal/` (sync to off-site storage) |
| Retention | 7 days of WAL segments |

### 2.3 Backup Verification

- After each backup, verify the dump file is non-empty and ends with the
  expected pg_dump trailer.
- Weekly: perform a test restore to a scratch database and run a row-count
  comparison against production.
- Monitor backup job exit codes via the alert pipeline (non-zero exit = P2
  alert).

---

## 3. Restore Procedures

### 3.1 Full Restore from pg_dump

Use this procedure when the database is lost, corrupted, or needs to be
rebuilt from a known-good snapshot.

**Prerequisites**:
- A valid backup file (`.dump` format) from `scripts/backup-postgres.sh`.
- A running Postgres instance with the target database created.
- The `scripts/restore-postgres.sh` script.

**Steps**:

1. **Identify the backup to restore**:
   ```bash
   ls -lt /backups/patchwork/ | head -10
   ```
   Select the most recent backup that predates the incident.

2. **Run the restore script**:
   ```bash
   scripts/restore-postgres.sh /backups/patchwork/patchwork_YYYYMMDD_HHMMSS.dump
   ```
   The script will:
   - Validate the backup file integrity.
   - Create a safety backup of the current database state.
   - Restore the selected backup.
   - Log restore metadata (duration, size, timestamp).

3. **Verify the restore** (see section 5).

4. **Restart dependent services**:
   ```bash
   docker compose restart patchwork-api patchwork-indexer patchwork-moderation
   ```

5. **Verify service health**:
   ```bash
   curl -s http://localhost:4000/health | jq .
   curl -s http://localhost:4100/health | jq .
   curl -s http://localhost:4200/health | jq .
   ```

### 3.2 Point-in-Time Recovery (PITR) from WAL

Use this procedure when you need to recover to a specific point in time
(e.g., just before an accidental data deletion).

**Prerequisites**:
- WAL archiving is enabled and archive files are available.
- A base backup (pg_dump or pg_basebackup) that predates the target time.

**Steps**:

1. **Stop Postgres**:
   ```bash
   docker compose -f docker-compose.postgres.yml stop postgres
   ```

2. **Restore the base backup** to the Postgres data directory.

3. **Create a `recovery.conf`** (Postgres < 12) or configure recovery
   settings in `postgresql.conf` (Postgres >= 12):
   ```ini
   restore_command = 'cp /backups/wal/%f %p'
   recovery_target_time = 'YYYY-MM-DD HH:MM:SS UTC'
   recovery_target_action = 'promote'
   ```

4. **Create the recovery signal file** (Postgres >= 12):
   ```bash
   touch /var/lib/postgresql/data/recovery.signal
   ```

5. **Start Postgres** -- it will replay WAL files up to the target time:
   ```bash
   docker compose -f docker-compose.postgres.yml up -d postgres
   ```

6. **Verify the restore** (see section 5) and confirm the data state
   matches the target recovery point.

---

## 4. DR Drill Checklist

Run this checklist during each DR drill (at minimum quarterly). Record
results in [game-day-log.md](game-day-log.md).

### Pre-Drill

- [ ] Confirm a recent backup exists and is accessible.
- [ ] Confirm WAL archive files are present (if using PITR).
- [ ] Ensure a staging/sandbox Postgres instance is available for the drill.
- [ ] Notify the team that a DR drill is in progress.
- [ ] Record the drill start time.

### During Drill

- [ ] Restore the backup to the staging Postgres instance using
      `scripts/restore-postgres.sh`.
- [ ] Measure the restore duration (target: within RTO of 1 hour).
- [ ] Verify data integrity (see section 5).
- [ ] Measure data freshness (target: within RPO of 15 minutes).
- [ ] Test that services can connect to the restored database and serve
      requests.
- [ ] Test the health endpoints return 200 after service restart.

### Post-Drill

- [ ] Record the drill end time and all measurements.
- [ ] Compare actual RTO and RPO against targets.
- [ ] Document any runbook deviations or gaps.
- [ ] File action items for any issues discovered.
- [ ] Update this runbook if procedures changed.
- [ ] Clean up the staging environment.

---

## 5. Verification Steps After Restore

### 5.1 Database Connectivity

```bash
docker compose -f docker-compose.postgres.yml exec postgres \
  pg_isready -U patchwork -d patchwork
```

Expected output: `patchwork:5432 - accepting connections`

### 5.2 Row Count Comparison

Compare key table row counts against the last known good values (or
production if available):

```sql
SELECT
  'aid_posts' AS table_name, COUNT(*) AS row_count FROM aid_posts
UNION ALL
SELECT
  'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL
SELECT
  'moderation_events' AS table_name, COUNT(*) AS row_count FROM moderation_events;
```

### 5.3 Data Freshness

Check the most recent record timestamps to confirm the RPO target was met:

```sql
SELECT MAX(created_at) AS latest_record FROM aid_posts;
SELECT MAX(created_at) AS latest_record FROM moderation_events;
```

### 5.4 Schema Integrity

Verify all expected tables and indexes exist:

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname;
```

### 5.5 Service Health

After restarting services against the restored database:

```bash
# Liveness
curl -sf http://localhost:4000/health | jq '.status'
curl -sf http://localhost:4100/health | jq '.status'
curl -sf http://localhost:4200/health | jq '.status'

# Readiness
curl -sf http://localhost:4000/health/ready && echo "API ready"
curl -sf http://localhost:4100/health/ready && echo "Indexer ready"
curl -sf http://localhost:4200/health/ready && echo "Moderation ready"
```

### 5.6 Functional Smoke Test

- Fetch the API landing page or a known endpoint.
- Verify the indexer checkpoint resumes advancing.
- Verify the moderation queue can enqueue and dequeue an item.

---

## 6. Backup Monitoring

Integrate backup job results with the existing alerting pipeline:

- **Non-zero exit code** from `scripts/backup-postgres.sh` should trigger a
  **P2 warning** alert.
- **Missing backup** (no successful backup in the last 12 hours) should
  trigger a **P1 critical** alert.
- Monitor the backup log file (`/var/log/patchwork-backup.log`) for errors.

---

*Created as part of Wave 3 reliability lane. Tracked by #107, #75, #68.*
