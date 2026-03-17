# Progressive Delivery Runbook (#110)

## Overview

Patchwork uses a canary-based progressive delivery strategy to reduce blast
radius during production deploys. Traffic is shifted incrementally while
observability checkpoints validate each step.

## Canary Rollout Strategy

| Step | Traffic Weight | Bake Time | Smoke Check |
|------|---------------|-----------|-------------|
| canary-5% | 5% | 5 minutes | Required |
| canary-25% | 25% | 5 minutes | Required |
| canary-50% | 50% | 10 minutes | Required |
| full-rollout | 100% | -- | -- |

See `DEFAULT_CANARY_STEPS` in `packages/shared/src/progressive-delivery.ts`.

## Rollout State Machine

```
not-started --> in-progress --> baking --> in-progress --> ... --> completed
                    |              |
                    v              v
               rolled-back    rolled-back
                    |              |
                    v              v
                aborted        aborted
```

Valid transitions are enforced by `isValidTransition()` and `ROLLOUT_TRANSITIONS`.

## Deployment Observability Checkpoints

At each rollout step, the following checkpoints are evaluated:

| Checkpoint | What It Checks |
|-----------|----------------|
| `health-probe` | Service `/health` endpoint returns 200 |
| `smoke-test` | Service `/health/ready` returns 200 |
| `error-rate-check` | Error rate below SLO burn threshold |
| `latency-check` | p95 latency below SLO burn threshold |
| `saturation-check` | Memory/queue saturation below threshold |

Checkpoint results are visible in the CI `progressive-delivery-gate` job.

## SLO Burn-Rate Rollback Triggers

Automatic rollback is triggered when any burn-rate threshold is breached:

| Metric | Max Burn Rate | Window | Severity |
|--------|--------------|--------|----------|
| `error_rate` | 2.0x budget | 5 minutes | critical |
| `latency_p95` | 1.5x budget | 5 minutes | warning |
| `saturation` | 1.5x budget | 10 minutes | warning |

The `evaluateBurnRate()` function in `packages/shared/src/progressive-delivery.ts`
checks current rates against these thresholds.

## Rollback Trigger Reasons

| Reason | Description |
|--------|-------------|
| `burn-rate-exceeded` | SLO burn rate crossed the threshold |
| `health-check-failed` | Service health endpoint returned non-200 |
| `smoke-check-failed` | Readiness probe failed during bake |
| `manual-abort` | Operator manually aborted the rollout |
| `bake-timeout-exceeded` | Step did not complete within expected time |

## Manual Override Procedures

### Pause Rollout

Freeze traffic at the current weight while investigating an issue.

```bash
make deploy-rollout-pause SERVICE=api
```

**When to use:** Unexpected behavior observed but not yet confirmed as a problem.
Does not require elevated privileges.

### Resume Rollout

Continue a paused rollout from where it stopped.

```bash
make deploy-rollout-resume SERVICE=api
```

**When to use:** After investigating and confirming the issue is benign.

### Skip Step

Advance past the current bake step to the next traffic weight.

```bash
make deploy-rollout-skip SERVICE=api
```

**When to use:** Bake time has been sufficient but the step timer has not expired.
Requires elevated privileges.

### Abort Rollout

Stop the rollout and route all traffic back to the previous version.

```bash
make deploy-rollout-abort SERVICE=api
```

**When to use:** Confirmed issue that requires rolling back. Does not require
elevated privileges.

### Force Complete

Skip all remaining steps and route 100% traffic to the new version.

```bash
make deploy-rollout-force SERVICE=api
```

**When to use:** Emergency situations where the new version must go live
immediately (e.g., security patch). Requires elevated privileges.

### Manual Rollback

Roll back to a specific previously-deployed version.

```bash
make rollback SERVICE=api ROLLBACK_TAG=0.9.0-a1b2c3d
```

**When to use:** Need to revert to a specific known-good version. Requires
elevated privileges.

## Rollout Telemetry

During a progressive rollout, the following telemetry is emitted:

1. **Deployment observability report** -- Summary of all checkpoints and
   rollback triggers for each step
2. **Prometheus metrics** -- All SLI metrics include the `environment` label
   (`staging` or `production`) for filtering
3. **Structured log lines** -- Alert events from `formatAlertLog()` in
   `packages/shared/src/alerting.ts`
4. **CI job output** -- The `progressive-delivery-gate` job prints checkpoint
   results and burn-rate thresholds

### PromQL Queries During Rollout

```promql
# Error rate on canary vs stable (by pod label)
rate(patchwork_sli_error_total{service="api",version="canary"}[5m])
/ rate(patchwork_sli_request_total{service="api",version="canary"}[5m])

# Latency comparison
patchwork_sli_request_duration_seconds{service="api",version="canary"}
/ patchwork_sli_request_total{service="api",version="canary"}
```

## Escalation

If a rollout causes an incident:

1. **Abort the rollout immediately:** `make deploy-rollout-abort SERVICE=<service>`
2. Follow the [Incident Response Runbook](incident-response.md)
3. Open a post-incident review after the rollback is confirmed stable
4. Update the rollback record with the trigger reason and resolution

---

*Tracks #110. Part of Wave 4, Lane 1: Release Environment & Promotion.*
