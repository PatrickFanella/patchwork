# Staging Delivery Runbook

## Overview

Patchwork currently uses an atomic, digest-pinned Compose deployment for the
single staging host. Canary traffic shifting is not available until a real
traffic-control layer exists; the older percentage model and echo-only CI job
were not deployment evidence and are disabled.

## Build-once promotion flow

1. `CI` completes quality and PostgreSQL/service integration gates on `main`.
2. `deploy-staging.yml` builds each of four runtime targets exactly once.
3. Trivy rejects high/critical findings before publication.
4. Images are pushed to GHCR, resolved to registry digests, keyless-signed with
   Cosign, accompanied by SPDX SBOM and SLSA provenance attestations, and
   recorded in `artifact-digests.json`.
5. The protected `staging` environment authorizes deployment.
6. The host pulls those exact digests, applies all migration jobs, and starts
   services with `--no-build`.
7. Deep readiness and the real two-account OAuth/PDS browser test determine
   success. A failure invokes the previous digest manifest automatically.

Before any pull or release-state change, the host runs
`scripts/verify-release-trust.sh`. It constrains the permitted image prefix and
verifies the signature plus both attestations using either the protected
GitHub OIDC identity or the scoped home-staging public key.

## Deployment state sequence

```
CI accepted -> images scanned -> images signed -> environment approved
     -> migrations -> deep readiness -> browser smoke -> current manifest
                              |                  |
                              +---- failure -----+
                                      |
                              previous manifest
```

Valid transitions are enforced by `isValidTransition()` and `ROLLOUT_TRANSITIONS`.

## Deployment Observability Checkpoints

The deployment is accepted only when these executable checkpoints succeed:

| Checkpoint | What It Checks |
|-----------|----------------|
| migration jobs | API, indexer, and moderation jobs exit zero |
| service readiness | Each database-backed runtime returns 200 from `/health/ready` |
| browser smoke | Real OAuth/PDS create, discover, report, block, close, delete passes |
| artifact redaction | Failure traces contain none of the supplied sensitive values |

Metrics-based canary promotion remains Task 7.3/production follow-up and must
not be represented as passing until real telemetry is queried.

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

## Manual rollback

```bash
cd "$STAGING_DEPLOY_PATH"
./rollback-staging-digests.sh "$STAGING_ENV_FILE" docker-compose.staging.yml
```

This restores all four runtime images together. It deliberately does not run
down migrations; see the forward-compatibility constraints in the rollback
policy.

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

### PromQL queries for a future traffic-controlled rollout

```promql
# Error rate on canary vs stable (by pod label)
rate(patchwork_sli_error_total{service="api",version="canary"}[5m])
/ rate(patchwork_sli_request_total{service="api",version="canary"}[5m])

# Latency comparison
patchwork_sli_request_duration_seconds{service="api",version="canary"}
/ patchwork_sli_request_total{service="api",version="canary"}
```

## Escalation

If a staging deployment causes an incident:

1. **Restore the previous manifest immediately:** run
   `rollback-staging-digests.sh` as shown above.
2. Follow the [Incident Response Runbook](incident-response.md)
3. Open a post-incident review after the rollback is confirmed stable
4. Update the rollback record with the trigger reason and resolution

---

Do not enable percentage-based promotion until the traffic router and live SLO
queries exist and have failure-drill evidence.
