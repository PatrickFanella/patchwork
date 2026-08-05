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
- Three one-shot migration prerequisites and dependency-aware `/health/ready`
  probes; process liveness alone is insufficient

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
| `ATPROTO_OAUTH_CLIENT_ID` | Production metadata URL | Staging metadata URL |
| `ATPROTO_OAUTH_REDIRECT_URI` | Production callback | Staging callback |
| `ATPROTO_SESSION_ENCRYPTION_KEY` | Production encryption key | Staging encryption key |
| `MODERATION_SERVICE_TOKEN` | Production internal token | Staging internal token |

See `docs/operations/staging-secrets.md` for the complete injection and rotation
contract. Neither manifest supplies identity, datasource, origin, OAuth,
encryption, moderation-token, or database-secret fallbacks.

Parity is enforced programmatically by `checkStagingParity()` in
`packages/shared/src/staging.ts`.

## Intended deployment pipeline

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

The protected CI path models these stages for GHCR/OIDC promotion. Separately,
the authorized NUC home-staging execution published, signed, deployed, rolled
back, and forward-promoted exact digests on 2026-07-28. See
`evidence/phase-7/immutable-delivery.md`. A green local Compose check alone is
still not deployment evidence, and the protected GitHub path remains
production hardening.

## Smoke Checks

Before promotion from staging to production, the following smoke checks must pass:

1. **Readiness probes** -- `GET /health/ready` returns 200 for API, indexer,
   and moderation worker only after database, schema, stream freshness, and
   internal service dependencies are usable
2. **Migration prerequisites** -- all three one-shot jobs exited successfully
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

The entries below record the accepted interim home-staging assignment effective
2026-08-05. This resolves the unnamed-owner gap but does not provide a distinct
secondary responder, a staffed rotation, or production-hours coverage.

| Responsibility | Owner |
|---------------|-------|
| Environment health | Patrick Fanella |
| Primary on-call | Patrick Fanella |
| Escalation | Patrick Fanella |
| Deployment pipeline | `ci.yml` deploy-staging job |

Patrick Fanella may act as Incident Commander for home-staging incidents and
is the first escalation point for alerts. Contact routing remains
environment-private and must not be committed to this repository. A separate
secondary owner and demonstrated alert acknowledgment are still required
before public operation.

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

Local manifest validation proves topology shape only. Real staging readiness,
backup/restore, rollback, alerts, and incident drills remain Phase 7 exit
evidence.
