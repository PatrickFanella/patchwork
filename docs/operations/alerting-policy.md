# Alerting Policy

This document defines the alert rules, escalation chain, and noise-reduction
guidelines for the Patchwork platform.

## Alert Rules

| Name                  | Severity   | Condition                                                  | Threshold       |
| --------------------- | ---------- | ---------------------------------------------------------- | --------------- |
| `error_rate_high`     | **P1** critical | HTTP 5xx error rate exceeds threshold over 5 min window   | > 5%            |
| `latency_p95_high`    | **P2** warning  | p95 response latency exceeds threshold over 5 min window  | > 2 s           |
| `queue_depth_high`    | **P2** warning  | Moderation queue pending depth exceeds threshold           | > 100 items     |
| `checkpoint_stale`    | **P1** critical | Indexer checkpoint has not advanced                        | > 5 min stale   |
| `disk_usage_high`     | **P2** warning  | Data volume disk usage exceeds threshold                   | > 80%           |
| `service_down`        | **P1** critical | Health check endpoint failing                              | any failure     |

## Escalation Chain

| Priority | Response time | Action                                |
| -------- | ------------- | ------------------------------------- |
| **P1** critical | 5 minutes   | Page on-call engineer immediately     |
| **P2** warning  | 15 minutes  | Notify on-call via chat channel       |
| **P3** info     | Daily       | Include in daily ops digest           |

## Runbook Links

Each alert rule links to a runbook with troubleshooting steps:

- `error_rate_high` -- https://docs.patchwork.community/runbooks/error-rate-high
- `latency_p95_high` -- https://docs.patchwork.community/runbooks/latency-p95-high
- `queue_depth_high` -- https://docs.patchwork.community/runbooks/queue-depth-high
- `checkpoint_stale` -- https://docs.patchwork.community/runbooks/checkpoint-stale
- `disk_usage_high` -- https://docs.patchwork.community/runbooks/disk-usage-high
- `service_down` -- https://docs.patchwork.community/runbooks/service-down

## Noise Reduction

1. **De-duplication window** -- An alert that has already fired should not
   re-fire within 10 minutes unless the severity increases.
2. **Auto-resolve** -- Alerts that return to normal for >= 5 minutes should
   be auto-resolved and logged as such.
3. **Grouped notifications** -- Multiple warnings within a 2-minute window
   should be grouped into a single notification.
4. **Maintenance windows** -- During planned maintenance, P2/P3 alerts are
   silenced. P1 alerts still fire but are tagged `maintenance=true`.

## On-Call Rotation

- Rotation is weekly, starting Monday 09:00 UTC.
- Primary and secondary on-call engineers are assigned.
- If the primary does not acknowledge a P1 within 5 minutes, escalate to
  the secondary.
- If neither acknowledges within 15 minutes, escalate to the engineering
  lead.

## Implementation Notes

Alerts are currently emitted as structured JSON log lines (see
`formatAlertLog` in `packages/shared/src/alerting.ts`). Any log-based
alerting pipeline (Grafana Loki, Datadog Logs, CloudWatch Logs Insights)
can ingest these lines and route notifications.

Example log line:

```json
{
  "level": "alert",
  "alert_name": "error_rate_high",
  "severity": "critical",
  "condition": "HTTP 5xx error rate exceeds 5% over a 5-minute window",
  "runbook_url": "https://docs.patchwork.community/runbooks/error-rate-high",
  "service": "api",
  "resolved": false,
  "timestamp": "2026-03-02T12:00:00.000Z",
  "details": { "errorRate": 0.08, "window": "5m" }
}
```
