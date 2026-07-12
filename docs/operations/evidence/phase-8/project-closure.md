# Patchwork project closure plan

Status: **prepared, not approved or executed**

Decision source: `alpha-go-no-go.md` (`NO-GO`, 2026-07-11)

This is the clean-closure branch required by Task 8.3. It does not authorize
data deletion, remote archival, registry deletion, DNS changes, or shutdown.
Product, engineering, and trust-and-safety must approve it and identify the
operator before execution.

## Current inventory

- No Patchwork container is running on the local Docker host.
- Local volume `patchwork_patchwork-postgres-data` remains and may contain
  test/development data. It has not been deleted.
- `main` was 58 commits ahead of `origin/main` at the latest local review. No
  continuation commit was pushed by this workflow.
- The configured remote is the Subculture Collective Patchwork repository.
- No verified staging deployment exists in committed evidence; repository
  evidence therefore cannot prove that external resources are absent.
- Running Action Network and Roberts Rules databases are unrelated and must not
  be stopped or removed during Patchwork closure.

The approved operator must independently inventory the staging host, registry,
DNS, OAuth registration, monitoring, backups, and secrets manager.

## Retained reusable assets

Retain the source and redacted engineering evidence for the AT lexicons and
client, privacy-safe ingestion/projections, authenticated lifecycle and
moderation stores, secured HTTP components, accessible React foundation,
fail-closed data mode, migrations, immutable delivery, recovery, retention,
metrics, alerting, and incident-runbook patterns.

Do not retain OAuth tokens, browser storage states, passwords, exact locations,
private moderation details, database dumps, or participant-bearing traces in
the reusable archive.

## Data-destruction sequence

Only after written approval and a legal-hold check:

1. Disable writes, OAuth callbacks, ingestion, and scheduled jobs.
2. Export only records approved for legal/security retention, encrypted with a
   named owner and destruction date.
3. Revoke OAuth, service, registry, SSH, webhook, database, and encryption
   credentials.
4. Delete browser/OAuth sessions and callback state before databases.
5. Destroy Patchwork databases, volumes, snapshots, logical backups, sidecars,
   WAL archives if any, replicas, and off-site copies after approved windows.
6. Delete private logs, alerts, traces, support exports, and disposable PDS
   records/accounts through their provider processes.
7. Verify deletion from primary, replica, backup, trash, and recovery storage;
   record operator, commands, timestamps, and redacted evidence.

The local volume may be removed only after inspection and approval:

```bash
docker volume inspect patchwork_patchwork-postgres-data
docker volume rm patchwork_patchwork-postgres-data
```

The removal command has not been executed.

## Infrastructure shutdown

The approved operator must capture any deployed digest manifest; stop only
Patchwork web, API, indexer, moderation, migration, database, monitoring, and
backup jobs; remove Patchwork-only networks, volumes, routes, certificates,
DNS, OAuth metadata, firewall rules, and schedules; revoke registry artifacts;
verify public URLs fail closed; and monitor for seven days for unexpected jobs,
traffic, or credential use.

## Dependency and repository archival

- Generate a final lockfile, vulnerability report, and runtime-version record.
- Disable deployment credentials and scheduled workflows before archival.
- Preserve issues, ADRs, and Git history; keep expansion plans marked deferred.
- Push or preserve local continuation commits only with owner authorization.
- Make the remote read-only and publish a closure notice only after approval.
- Record licenses or policies that constrain archival or deletion.

## Approval and execution record

| Role | Approver | Decision | Timestamp |
| --- | --- | --- | --- |
| Product | Unassigned | Pending | Pending |
| Engineering | Unassigned | Pending | Pending |
| Trust and safety | Unassigned | Pending | Pending |
| Privacy/legal hold | Unassigned | Pending | Pending |
| Closure operator | Unassigned | Pending | Pending |

Until all required approvals exist, Patchwork remains `NO-GO` and dormant, but
not formally closed. Expansion work remains prohibited.
