# PostgreSQL disaster recovery

## Objectives and present capability

The alpha targets an RTO below one hour and an RPO below 15 minutes. The
implemented mechanism is a validated PostgreSQL custom-format logical backup.
Point-in-time recovery and WAL archiving are not configured and must not be
claimed as available.

Run `scripts/backup-postgres.sh` at least every six hours and copy its `.dump`,
`.sha256`, and `.json` files to independently durable storage. The job writes a
Prometheus textfile at `PATCHWORK_BACKUP_METRICS_FILE`. The alert threshold of
7.5 hours allows one delayed six-hour run before paging.

Use backup tooling from the same PostgreSQL major version as the source. The
script intentionally lets `pg_dump` reject a major-version mismatch rather
than producing ambiguous recovery evidence.

The backup is written with a restrictive `077` umask to a private temporary
directory, checked with
`pg_restore --list`, checksummed, and only then atomically published. A failed
attempt publishes no archive and changes `patchwork_backup_last_attempt_success`
to zero without erasing the last-success timestamp.

## Restore procedure

1. Provision a new, empty PostgreSQL database with the same major version.
2. Stop application writes and record the incident and restore start times.
3. Select a backup and verify that its checksum sidecar is present.
4. Set `PGHOST`, `PGPORT`, `PGUSER`, and `PGDATABASE` to the empty target.
5. Set `RESTORE_VERIFICATION_SQL` to a statement that raises an error unless
   the expected projection and private-state invariants hold.
6. Run:

   ```bash
   SKIP_CONFIRM=yes REQUIRE_EMPTY_DATABASE=yes \
     scripts/restore-postgres.sh /backups/patchwork/patchwork_TIMESTAMP.dump
   ```

The script refuses a target containing any user table. It validates the
archive and optional checksum, restores with `--exit-on-error`, deletes all
browser sessions, OAuth state, and OAuth sessions in one transaction, runs the
operator verification SQL, proves that no session rows remain, and emits
measured `duration_seconds` and `recovery_point_seconds`.

At minimum, verification SQL must check:

- `indexer_aid_post_projections` and projection state are present;
- `request_workflows`, blocks, reports, and audit state have expected counts;
- `moderation_queue_items` and audit records have expected counts;
- the three session tables are empty after invalidation.

Start the indexer first, then moderation, API, and web. Require deep readiness,
projection freshness, a new OAuth login, and the real browser smoke journey
before restoring traffic. Never reuse session cookies or OAuth payloads from a
backup.

## Backup monitoring

Prometheus must ingest the backup textfile and load the executable rules in
`monitoring/prometheus/patchwork-alerts.yml`. A drill is incomplete until both
failed-backup and stale-backup notifications are received and resolved through
the configured staging notification path.

Run a restore drill at least quarterly and after material schema or backup
changes. Always restore into a disposable empty database; never use the live
database as the drill target.
