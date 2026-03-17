# Production Readiness Board -- Milestone Map

Tracks: #68 (Production Readiness), #95 (Board + Milestone Map), #71 (Epic A -- Governance)

---

## Milestone Overview

| Milestone | Title | Target Date | Epic(s) | Sub-Epic |
|-----------|-------|-------------|---------|----------|
| **M0** | Foundation & Governance (Wave 0) | 2026-03-15 | A (#71) | #82 |
| **M1** | Runtime Durability | 2026-04-05 | B (#70) | #84 |
| **M2** | Core Product Lifecycle | 2026-04-19 | C (#72) | #83 |
| **M3** | Account & Privacy | 2026-05-03 | D (#75) | #85 |
| **M4** | Global UX (i18n + a11y) | 2026-05-17 | E (#73) | #86 |
| **M5** | Trust & Verification | 2026-06-07 | F (#74) | #87 |

---

## Issue-to-Milestone Assignment

### M0: Foundation & Governance (Wave 0)

| Issue | Title | Track | Owner | Status |
|-------|-------|-------|-------|--------|
| #94 | Define RACI for product, infra, moderation, incident command | A2 | TBD | Open |
| #95 | Create production readiness board and milestone map | A1 | TBD | Open |

### M1: Runtime Durability

| Issue | Title | Track | Owner | Status |
|-------|-------|-------|-------|--------|
| #96 | Replace moderation fixture service with durable queue/state backend | B2 | TBD | Open |
| #97 | Replace indexer fixture pipeline with persistent ingestion runtime | B1 | TBD | Open |
| #98 | Enforce strict production datasource modes and startup guards | B3 | TBD | Open |
| #99 | Add E2E contract path against production-like dependencies | B4 | TBD | Open |

### M2: Core Product Lifecycle

| Issue | Title | Track | Owner | Status |
|-------|-------|-------|-------|--------|
| #100 | Secrets management hardening | C1 | TBD | Open |
| #101 | Add supply-chain and container security gates in CI | C2 | TBD | Open |
| #102 | Harden API perimeter (rate limits, CORS, abuse controls) | C3 | TBD | Open |
| #103 | Implement data retention and deletion policy | C4 | TBD | Open |
| #116 | Implement canonical request lifecycle state machine end-to-end | G1 | TBD | Open |

### M3: Account & Privacy

| Issue | Title | Track | Owner | Status |
|-------|-------|-------|-------|--------|
| #104 | Build centralized metrics dashboards and SLI definitions | D1 | TBD | Open |
| #105 | Implement alerting policy for SLO burn and critical failures | D2 | TBD | Open |
| #106 | Implement backup, restore, and disaster recovery drills | D3 | TBD | Open |
| #107 | Create incident response runbook and execute game day | D4 | TBD | Open |
| #120 | Add account settings and privacy controls center | H2 | TBD | Open |

### M4: Global UX (i18n + a11y)

| Issue | Title | Track | Owner | Status |
|-------|-------|-------|-------|--------|
| #108 | Introduce staging environment parity with production | E1 | TBD | Open |
| #109 | Implement immutable image versioning and rollback strategy | E2 | TBD | Open |
| #110 | Implement progressive delivery (canary or weighted rollout) | E3 | TBD | Open |
| #111 | Run performance and scale validation | E4 | TBD | Open |
| #133 | Implement internationalization and localization framework | K4 | TBD | Open |
| #134 | Execute accessibility AA+ compliance program | K3 | TBD | Open |

### M5: Trust & Verification

| Issue | Title | Track | Owner | Status |
|-------|-------|-------|-------|--------|
| #112 | Build moderator operations console MVP and SOPs | F1 | TBD | Open |
| #113 | Publish legal and policy readiness pack | F2 | TBD | Open |
| #114 | Execute pilot rollout and go/no-go checklist | F3 | TBD | Open |
| #115 | Execute GA release and 7-day hypercare | F4 | TBD | Open |
| #131 | Add verification tiers for volunteers and organizations | J2 | TBD | Open |

---

## Board Views

### By Epic

| Epic | Ref | Issues | Milestone(s) |
|------|-----|--------|-------------|
| A: Program Governance | #71 | #94, #95 | M0 |
| B: Runtime Completeness | #70 | #96, #97, #98, #99 | M1 |
| C: Security & Privacy | #72 | #100, #101, #102, #103 | M2 |
| D: Reliability & Observability | #75 | #104, #105, #106, #107 | M3 |
| E: Release Engineering | #73 | #108, #109, #110, #111 | M4 |
| F: Trust-Safety & Launch | #74 | #112, #113, #114, #115 | M5 |

### By Blocker State

| Issue | Blocked By | Blocking | Notes |
|-------|-----------|----------|-------|
| #120 | #121 (H1) | -- | Informational dependency; does not block Wave 0 |
| #131 | #123 (H3) | -- | Informational dependency; does not block Wave 0 |
| #96 | -- | #98, #99 | Moderation runtime must exist before guards/E2E |
| #97 | -- | #98, #99 | Indexer runtime must exist before guards/E2E |
| #114 | #112, #113 | #115 | Pilot requires console + legal pack |
| #115 | #114 | -- | GA requires successful pilot |

### Wave 0 Issues (all link to #68)

All Wave 0 issues are tracked under the production readiness program (#68):

- #94 -- RACI definition (A2)
- #95 -- Board and milestone map (A1)
- #96 -- Moderation runtime (B2)
- #97 -- Indexer runtime (B1)
- #116 -- Request lifecycle (G1)
- #120 -- Account settings (H2)
- #131 -- Verification tiers (J2)
- #133 -- i18n framework (K4)
- #134 -- a11y compliance (K3)

---

## Setup Scripts

The following scripts automate GitHub milestone creation and issue linking. They require a `gh` CLI token with Issues (read/write) permission.

- `docs/operations/milestone-setup.sh` -- Creates milestones M0-M5
- `docs/operations/link-issues.sh` -- Adds tracking comments and blocker clarifications

### Running the scripts

```bash
# Ensure your gh token has Issues read/write scope
gh auth status

# Create milestones
./docs/operations/milestone-setup.sh

# Link issues to #68 and add blocker notes
./docs/operations/link-issues.sh

# Assign issues to milestones (manual step, example):
gh issue edit 94 --milestone "M0: Foundation & Governance (Wave 0)"
gh issue edit 95 --milestone "M0: Foundation & Governance (Wave 0)"
gh issue edit 96 --milestone "M1: Runtime Durability"
gh issue edit 97 --milestone "M1: Runtime Durability"
# ... etc.
```

---

## Assigning Issues to Milestones (Reference Commands)

```bash
# M0
gh issue edit 94 --milestone "M0: Foundation & Governance (Wave 0)"
gh issue edit 95 --milestone "M0: Foundation & Governance (Wave 0)"

# M1
gh issue edit 96 --milestone "M1: Runtime Durability"
gh issue edit 97 --milestone "M1: Runtime Durability"
gh issue edit 98 --milestone "M1: Runtime Durability"
gh issue edit 99 --milestone "M1: Runtime Durability"

# M2
gh issue edit 100 --milestone "M2: Core Product Lifecycle"
gh issue edit 101 --milestone "M2: Core Product Lifecycle"
gh issue edit 102 --milestone "M2: Core Product Lifecycle"
gh issue edit 103 --milestone "M2: Core Product Lifecycle"
gh issue edit 116 --milestone "M2: Core Product Lifecycle"

# M3
gh issue edit 104 --milestone "M3: Account & Privacy"
gh issue edit 105 --milestone "M3: Account & Privacy"
gh issue edit 106 --milestone "M3: Account & Privacy"
gh issue edit 107 --milestone "M3: Account & Privacy"
gh issue edit 120 --milestone "M3: Account & Privacy"

# M4
gh issue edit 108 --milestone "M4: Global UX (i18n + a11y)"
gh issue edit 109 --milestone "M4: Global UX (i18n + a11y)"
gh issue edit 110 --milestone "M4: Global UX (i18n + a11y)"
gh issue edit 111 --milestone "M4: Global UX (i18n + a11y)"
gh issue edit 133 --milestone "M4: Global UX (i18n + a11y)"
gh issue edit 134 --milestone "M4: Global UX (i18n + a11y)"

# M5
gh issue edit 112 --milestone "M5: Trust & Verification"
gh issue edit 113 --milestone "M5: Trust & Verification"
gh issue edit 114 --milestone "M5: Trust & Verification"
gh issue edit 115 --milestone "M5: Trust & Verification"
gh issue edit 131 --milestone "M5: Trust & Verification"
```

---

## Service Health Endpoints

Each service exposes liveness and readiness probes at standardized paths.
See [SLI/SLO Definitions](sli-slo.md) for response schema details.

| Service | Default Port | Liveness | Readiness | Metrics |
|---------|-------------|----------|-----------|---------|
| **API** (`service="api"`) | 4000 | `GET /health` | `GET /health/ready` | `GET /metrics` |
| **Indexer** (`service="indexer"`) | 4100 | `GET /health` | `GET /health/ready` | `GET /metrics` |
| **Moderation Worker** (`service="moderation-worker"`) | 4200 | `GET /health` | `GET /health/ready` | `GET /metrics` |

---

## SLI Ownership

Each SLI metric has a designated owning team responsible for its definition,
alerting thresholds, and dashboard maintenance. See [RACI](raci.md) for the
full responsibility matrix and [Alerting Policy](alerting-policy.md) for
threshold definitions.

| SLI Metric | Service(s) | Owning Team | Alert Rule |
|-----------|-----------|-------------|------------|
| `patchwork_sli_request_total` | api, indexer, moderation-worker | INFRA + respective ENG-* | -- |
| `patchwork_sli_error_total` | api, indexer, moderation-worker | INFRA + respective ENG-* | `error_rate_high` |
| `patchwork_sli_request_duration_seconds` | api | ENG-BE + INFRA | `latency_p95_high` |
| `patchwork_sli_saturation_ratio` | api, moderation-worker | INFRA | `disk_usage_high` |
| `patchwork_service_up` | api, indexer, moderation-worker | INFRA | `service_down` |
| `patchwork_checkpoint_lag_seconds` | indexer | ENG-IDX + INFRA | `checkpoint_stale` |
| `moderation_queue_depth` | moderation-worker | ENG-MOD + INFRA | `queue_depth_high` |
| `moderation_queue_latency_seconds` | moderation-worker | ENG-MOD | -- |

---

## Production Readiness Scorecard

Rate each category **Green** (meets bar), **Yellow** (partial / in-progress),
or **Red** (not started / blocking). Update at each milestone review.

### Observability

| Check | Status | Notes |
|-------|--------|-------|
| All services expose `/metrics` in Prometheus format | Green | Implemented in Wave 2 |
| SLI metrics use consistent `patchwork_sli_` prefix | Green | Enforced by `packages/shared/src/sli.ts` |
| Dashboard-ready labels (project, service, component, environment) | Green | Added in Wave 3 |
| Structured alert log lines emitted for all 6 alert rules | Green | `packages/shared/src/alerting.ts` |
| Grafana dashboards provisioned (or queries documented) | Yellow | Query templates below; dashboard JSON pending |
| Distributed tracing enabled | Red | Not yet implemented |

### Security

| Check | Status | Notes |
|-------|--------|-------|
| Secrets stored outside source control | Green | `.env` on host; see `secrets-rotation.md` |
| Secrets rotation procedure documented | Green | `docs/operations/secrets-rotation.md` |
| Rate limiting on API endpoints | Green | Implemented in Wave 2 |
| CORS policy configured | Green | Implemented in Wave 2 |
| Container image scanning in CI | Yellow | Tracked by #101 |
| Dependency vulnerability scanning | Yellow | Tracked by #101 |

### Reliability

| Check | Status | Notes |
|-------|--------|-------|
| Health endpoints (liveness + readiness) on all services | Green | See table above |
| SLOs defined with measurable thresholds | Green | `docs/operations/sli-slo.md` |
| Alerting policy with escalation chain | Green | `docs/operations/alerting-policy.md` |
| Incident response runbook | Green | `docs/operations/incident-response.md` |
| Backup and restore procedures | Green | `scripts/backup-postgres.sh`, `docs/operations/disaster-recovery.md` |
| Game day exercises executed | Yellow | Template in `docs/operations/game-day-log.md` |
| DR drill completed | Yellow | Tracked by #107 |

### Performance

| Check | Status | Notes |
|-------|--------|-------|
| API p95 latency < 500 ms (SLO target) | Yellow | Baseline measurement pending |
| Indexer checkpoint lag < 60 s (SLO target) | Yellow | Baseline measurement pending |
| Moderation queue latency p95 < 30 s (SLO target) | Yellow | Baseline measurement pending |
| Load testing executed | Red | Tracked by #111 |
| Resource limits set on containers | Yellow | Staging parity in place (#108) |

### Release Engineering

| Check | Status | Notes |
|-------|--------|-------|
| Staging environment parity with production | Green | `docker-compose.staging.yml`, `staging.ts` (#108) |
| Auto-deploy pipeline to staging | Green | `ci.yml` deploy-staging job (#108) |
| Smoke checks block failed promotions | Green | `evaluatePromotionGate()` (#108) |
| Staging ownership defined | Green | `docs/operations/staging-environment.md` (#108) |
| Immutable image tagging | Green | OCI labels + `BUILD_VERSION-GIT_SHA` format (#109) |
| One-command rollback path | Green | `make rollback SERVICE= ROLLBACK_TAG=` (#109) |
| Migration rollback policy documented | Green | `docs/operations/rollback-policy.md` (#109) |
| Progressive rollout strategy | Green | Canary 5%->25%->50%->100% (#110) |
| Automated rollback triggers | Green | SLO burn-rate thresholds (#110) |
| Rollout telemetry visible during deploy | Green | CI progressive-delivery-gate job (#110) |
| Progressive delivery runbook | Green | `docs/operations/progressive-delivery-runbook.md` (#110) |

### Mobile Readiness

| Check | Status | Notes |
|-------|--------|-------|
| Mobile shared contracts defined | Green | `packages/shared/src/mobile.ts` (#135) |
| Mobile API client consuming shared contracts | Green | `apps/mobile/src/api-client.ts` (#135) |
| Core flow parity tracking | Yellow | 8 flows defined; mobile pending implementation |
| Mobile navigation model | Green | Tab-based with deep link support (#135) |
| Push notification integration | Green | Shared NotificationType contracts (#135) |
| Mobile offline sync | Green | Wraps shared SyncQueue with mobile concerns (#135) |
| Device QA matrix defined | Green | `docs/operations/mobile-release-checklist.md` (#135) |
| QA checks executed (iOS) | Red | Pending first release build |
| QA checks executed (Android) | Red | Pending first release build |
| Store metadata complete (App Store) | Red | Tracked by #135 |
| Store metadata complete (Play Store) | Red | Tracked by #135 |
| Privacy declarations reviewed | Yellow | Declarations drafted; legal review pending |
| Mobile architecture ADR | Green | `docs/architecture/adr/0002-mobile-architecture.md` |

---

## Grafana / Prometheus Dashboard Query Templates

These PromQL queries can be imported into Grafana panels or used directly
in the Prometheus expression browser. All queries support the `environment`
label for filtering by deployment target.

### Service Overview Panel

```promql
# Availability -- all services, current environment
patchwork_service_up{project="patchwork",environment="$environment"}
```

### API Error Rate (5m rolling)

```promql
rate(patchwork_sli_error_total{service="api",environment="$environment"}[5m])
/ rate(patchwork_sli_request_total{service="api",environment="$environment"}[5m])
```

### API Latency Budget Burn

```promql
# Cumulative duration / request count gives mean latency
patchwork_sli_request_duration_seconds{service="api",environment="$environment"}
/ patchwork_sli_request_total{service="api",environment="$environment"}
```

### Indexer Checkpoint Lag

```promql
patchwork_checkpoint_lag_seconds{service="indexer",environment="$environment"}
```

### Indexer Throughput (events/sec, 5m)

```promql
rate(patchwork_ingest_events_total{service="indexer",environment="$environment"}[5m])
```

### Moderation Queue Depth

```promql
moderation_queue_depth{service="moderation-worker",environment="$environment"}
```

### Moderation Queue Latency

```promql
moderation_queue_latency_seconds{service="moderation-worker",environment="$environment"}
```

### Moderation Queue Saturation

```promql
patchwork_sli_saturation_ratio{service="moderation-worker",environment="$environment"}
```

### Memory Saturation -- All Services

```promql
patchwork_sli_saturation_ratio{project="patchwork",environment="$environment"}
```

### Cross-Service Error Rate Comparison (5m)

```promql
rate(patchwork_sli_error_total{project="patchwork",environment="$environment"}[5m])
/ rate(patchwork_sli_request_total{project="patchwork",environment="$environment"}[5m])
```

### Grafana Dashboard JSON Skeleton

The following JSON can be imported into Grafana (Dashboards > Import) as a
starting point. Replace `$PROMETHEUS_DS` with the UID of your Prometheus
data source.

```json
{
  "dashboard": {
    "title": "Patchwork Platform Overview",
    "uid": "patchwork-overview",
    "tags": ["patchwork", "sli"],
    "timezone": "utc",
    "templating": {
      "list": [
        {
          "name": "environment",
          "type": "query",
          "query": "label_values(patchwork_service_up, environment)",
          "datasource": "$PROMETHEUS_DS"
        }
      ]
    },
    "panels": [
      {
        "title": "Service Health",
        "type": "stat",
        "gridPos": { "h": 4, "w": 24, "x": 0, "y": 0 },
        "targets": [
          {
            "expr": "patchwork_service_up{environment=\"$environment\"}",
            "legendFormat": "{{service}}"
          }
        ]
      },
      {
        "title": "Error Rate (5m)",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
        "targets": [
          {
            "expr": "rate(patchwork_sli_error_total{environment=\"$environment\"}[5m]) / rate(patchwork_sli_request_total{environment=\"$environment\"}[5m])",
            "legendFormat": "{{service}}"
          }
        ]
      },
      {
        "title": "Indexer Checkpoint Lag",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
        "targets": [
          {
            "expr": "patchwork_checkpoint_lag_seconds{environment=\"$environment\"}",
            "legendFormat": "checkpoint lag"
          }
        ]
      },
      {
        "title": "Moderation Queue Depth",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 12 },
        "targets": [
          {
            "expr": "moderation_queue_depth{environment=\"$environment\"}",
            "legendFormat": "queue depth"
          }
        ]
      },
      {
        "title": "Saturation",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 12 },
        "targets": [
          {
            "expr": "patchwork_sli_saturation_ratio{environment=\"$environment\"}",
            "legendFormat": "{{service}}"
          }
        ]
      }
    ]
  }
}
```

---

*Created as part of Wave 0 governance lane. Updated in Wave 3 (#102), Wave 5 (#135). Tracked by #95, #71, #68.*
