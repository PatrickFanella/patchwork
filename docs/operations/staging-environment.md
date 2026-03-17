# Staging Environment -- Parity & Promotion (#108)

## Overview

The staging environment mirrors production topology 1:1 so that every deployment
is validated against production-equivalent infrastructure before promotion.

## Topology Parity

| Service | Production Container | Staging Container | Port |
|---------|---------------------|-------------------|------|
| API | `patchwork-api` | `patchwork-staging-api` | 4000 |
| Indexer | `patchwork-spool` | `patchwork-staging-spool` | 4100 |
| Moderation | `patchwork-thimble` | `patchwork-staging-thimble` | 4200 |
| Web | `patchwork-web` | `patchwork-staging-web` | 80 |
| Postgres | `patchwork-postgres` | `patchwork-staging-postgres` | 5432 |

Both environments use:
- The same `Dockerfile` multi-stage build targets
- Identical health check configurations
- The same network isolation model (`internal` + `web` networks)
- Production `NODE_ENV=production` with `PATCHWORK_ENV=staging` for metrics labeling

## Configuration Parity

Staging uses the same environment variable keys as production. Values differ only
where necessary (hostnames, DIDs, database passwords):

| Variable | Production | Staging |
|----------|-----------|---------|
| `NODE_ENV` | `production` | `production` |
| `PATCHWORK_ENV` | `production` | `staging` |
| `ATPROTO_SERVICE_DID` | Real DID | Staging DID |
| `API_PUBLIC_ORIGIN` | `https://patchwork.subcult.tv` | `https://staging.patchwork.subcult.tv` |
| `PATCHWORK_POSTGRES_PASSWORD` | Production secret | Staging secret |

Parity is enforced programmatically by `checkStagingParity()` in
`packages/shared/src/staging.ts`.

## Auto-Deploy Pipeline

```
push to main
    |
    v
quality-gates job (lint, typecheck, test, security scans)
    |
    v
e2e-production job (contract-path tests against Postgres)
    |
    v
deploy-staging job (build immutable images, verify labels, smoke check)
    |
    v
progressive-delivery-gate job (canary readiness, rollback trigger audit)
```

The `deploy-staging` job runs automatically on every push to `main` after all
quality gates pass. See `.github/workflows/ci.yml`.

## Smoke Checks

Before promotion from staging to production, the following smoke checks must pass:

1. **Health probes** -- `GET /health` returns 200 for api, indexer, and moderation-worker
2. **Readiness probes** -- `GET /health/ready` returns 200 (not 503) for all services
3. **Image label verification** -- OCI labels contain correct git SHA and version

Run smoke checks manually:

```bash
make staging-smoke
```

Failed smoke checks block promotion to production.

## Promotion Gate

The `evaluatePromotionGate()` function in `packages/shared/src/staging.ts`
evaluates two conditions:

1. **Parity checks** -- staging topology matches production (service count, env vars)
2. **Smoke checks** -- all service health endpoints respond successfully

Both must pass for `allowed: true`. See the `PromotionGateResult` type for details.

## Staging Ownership

| Responsibility | Owner |
|---------------|-------|
| Environment health | INFRA team |
| Primary on-call | infra-oncall@patchwork.community |
| Escalation | eng-lead@patchwork.community |
| Deployment pipeline | `ci.yml` deploy-staging job |

## Make Targets

| Target | Description |
|--------|-------------|
| `make staging-up` | Start staging stack |
| `make staging-down` | Stop staging stack |
| `make staging-ps` | Show staging container status |
| `make staging-logs` | Tail staging logs |
| `make staging-smoke` | Run smoke checks |
| `make staging-db-migrate` | Run database migrations in staging |
| `make staging-build` | Build staging images with immutable tags |

---

*Tracks #108. Part of Wave 4, Lane 1: Release Environment & Promotion.*
