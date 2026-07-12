# Phase 7 recovery and alerting evidence

Status: **local mechanism proven; real staging exercise pending**

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

## Remaining authorized-staging gate

These roadmap items remain open until an authorized staging URL and alert
receiver exist:

- restore an actual staging backup into a separate empty staging database;
- observe and acknowledge every alert through the real notification route;
- execute the indexer-disconnect game day against the deployed source;
- execute the database-restore game day and pass the OAuth/browser smoke test;
- record staging RTO/RPO, alert timestamps, operator decisions, and resolution.

Local evidence proves the mechanism and failure guards, not the Phase 7 exit
gate. No deployment, DNS change, registry publication, or external message was
performed.
