# Alerting policy

Patchwork's executable staging rules are
[`monitoring/prometheus/patchwork-alerts.yml`](../../monitoring/prometheus/patchwork-alerts.yml).
They are validated with `promtool check rules`; notification delivery and alert
transitions must still be demonstrated on the authorized staging stack.

| Alert | Severity | Condition | Response |
| --- | --- | --- | --- |
| `PatchworkApiErrorRateHigh` | critical | API 5xx ratio above 5% for 5 minutes | Page within 5 minutes |
| `PatchworkIndexerDisconnected` | critical | AT source disconnected for 2 minutes | Page within 5 minutes |
| `PatchworkIndexerLagHigh` | critical | AT delivery lag above 5 minutes for 5 minutes | Page within 5 minutes |
| `PatchworkModerationQueueOldestItemHigh` | warning | oldest queued case above 15 minutes for 5 minutes | Respond within 15 minutes |
| `PatchworkDatabaseUnavailable` | critical | PostgreSQL scrape target down for 1 minute | Page within 5 minutes |
| `PatchworkBackupFailed` | warning | most recent backup attempt failed | Respond within 15 minutes |
| `PatchworkBackupStale` | warning | no successful backup for 7.5 hours | Respond within 15 minutes |

The API records completed requests and 5xx responses in the shared SLI
counters. The indexer exports source connection and lag gauges. Moderation
calculates depth and oldest-item age from its durable queue at scrape time.
The backup script atomically writes Prometheus textfile metrics and preserves
the previous success timestamp after a failed attempt. PostgreSQL availability
uses Prometheus target health (`up`) from the `patchwork-postgres` scrape job.

Alerts auto-resolve only after their expression is healthy. Planned maintenance
may silence warnings, but not critical data-loss or outage alerts. Every alert
must retain its `runbook_url` annotation. A staging game day must prove routing,
receipt, acknowledgement, and resolution before Phase 7 can close.
