# Phase 7 recovery and alerting evidence

Status: **NUC staging recovery and indexer-disconnect exercises complete;
protected immutable deployment and human acknowledgment remain pending**

## NUC staging exercises — 2026-07-28 UTC

The home-network NUC runtime supplied the previously absent Prometheus,
Alertmanager, PostgreSQL, API, indexer, moderation, web, PDS, and local
Jetstream boundaries. The exercises remained isolated to Patchwork.

### Alert wiring correction

Prometheus was already scraping the API, indexer, and moderation worker, but
the runtime metrics were labeled `environment="development"` while every rule
selected `environment="staging"`. Production Compose also omitted the explicit
environment label. A failing Compose contract test now requires `production`
for the production manifest and `staging` for the staging manifest. The
NUC-owned override selects staging.

The 11-rule `patchwork-staging-critical` group is now loaded into the existing
Prometheus/Alertmanager stack. Six required source families are present:
API errors, event-source connection and lag, moderation queue age, PostgreSQL
availability, and backup status. A dedicated pinned PostgreSQL exporter
provides `up{job="patchwork-postgres",environment="staging"}`; node-exporter
ingests the backup textfile.

### Indexer-disconnect game day

| Event | UTC timestamp | Observation |
| --- | --- | --- |
| Local Patchwork Jetstream stopped | 18:12:54 | Indexer remained healthy and reported source connection `0` |
| Alert pending | 18:13:10 | Prometheus honored the configured two-minute hold |
| Alert firing | 18:15:10 | Alertmanager reported the alert active and routed it to `ntfy` |
| Jetstream restarted | 18:15:26 | Indexer reconnected with source connection `1`; alert resolved |

Alertmanager reported zero webhook notification failures. Human receipt and
acknowledgment were not independently observed, so that organizational proof
is not claimed.

### Live backup and empty-target restore game day

The first attempt deliberately exposed operational drift: the live server is
PostgreSQL 17.10, while the old drill text assumed PostgreSQL 16. A v16
`pg_dump` correctly refused the major-version mismatch and published no
archive. The rerun pinned PostgreSQL 17 tooling.

- validated custom archive: 127,174 bytes;
- backup publication: 2026-07-28 18:17:58 UTC;
- empty PostgreSQL 17 target: `127.0.0.1:55440`;
- restore duration/RTO: 1 second;
- measured recovery-point age/RPO: 22 seconds;
- recovered aid projections: 360 of 360;
- recovered reports/audits/deactivations/idempotency rows: exact source match;
- restored OAuth sessions removed: 2;
- restored OAuth-state rows removed: 1;
- remaining browser/OAuth state after restore: 0.

The drill also found that final archives inherited `0644` despite the private
temporary directory. `backup-postgres.sh` now sets `umask 077`; the regression
test and a second live backup proved all published archive, checksum, metadata,
and metric files are `0600`.

Commands exercised:

```text
docker compose stop/start patchwork-jetstream
promtool check config /etc/prometheus/prometheus.yml
scripts/backup-postgres.sh
scripts/restore-postgres.sh <validated archive>
```

## Isolated recovery drill

Executed 2026-07-12 UTC against disposable PostgreSQL 16 container
`patchwork-recovery-drill`, bound only to `127.0.0.1:55439`. Port 55432 was
already allocated and was deliberately left untouched. No existing Patchwork,
DSA Proto, or home-network service was changed.

The source database applied API migrations 0001-0011, indexer migrations
0001-0003, and moderation migrations 001-002. Seed evidence included one
browser/OAuth session set, one private request workflow, one durable aid-post
projection, and one moderation queue case.

Commands exercised:

```text
scripts/backup-postgres.sh
scripts/restore-postgres.sh <validated archive>
promtool check rules monitoring/prometheus/patchwork-alerts.yml
```

Observed results:

- validated custom archive: 59,409 bytes with SHA-256 and JSON sidecars;
- restore into a freshly created empty database: under 1 second;
- measured recovery-point age: 36 seconds;
- recovered workflow rows: 1;
- recovered projection rows: 1;
- recovered moderation queue rows: 1;
- remaining browser, OAuth session, and OAuth-state rows: 0;
- repeated restore into the populated database: refused with 21 user tables;
- deliberately failed backup: no archive published, failure metric set to 0,
  prior success timestamp retained;
- Prometheus validation: success, seven rules found.

The first verification expression used a constant `1/0` failure branch and
PostgreSQL planned that branch even when its condition was false. It was
replaced for the drill with an explicit `DO` block that raises only when an
invariant fails. The drill also exposed GNU/macOS `stat` incompatibility in RPO
measurement; the restore script now detects the supported form before use.

## Executable alert coverage

The committed rules cover API 5xx ratio, AT event-source disconnect and lag,
oldest moderation queue item, PostgreSQL target loss, failed backup, and stale
backup. API and moderation runtime emitters were completed in the same slice.

## Remaining Phase 7 boundary

The NUC exercises prove the deployed alert, disconnect, backup, restore,
session-invalidation, and recovery mechanisms. Phase 7 is still not closed:
images have not been scanned, signed, pushed, and deployed by digest through
the protected workflow; rollback has not run from a prior four-digest
manifest; and no human has acknowledged the notification or accepted incident
ownership. No DNS change or registry publication was performed.
