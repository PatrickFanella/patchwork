# Phase 7 persistent topology evidence

Date: 2026-07-11

This evidence closes the locally verifiable Task 7.1 topology contract. It did
not claim a real staging deployment when recorded; the later 2026-07-28 NUC
execution is recorded in `immutable-delivery.md` and `staging-readiness.md`.

## Topology

Production and staging now contain the same durable dependency graph:

1. PostgreSQL passes `pg_isready`.
2. One-shot API, indexer, and moderation migration services complete.
3. Indexer and moderation start with PostgreSQL connectivity and expose deep
   `/health/ready` checks.
4. API waits for its migration, indexer migration/freshness, and moderation
   readiness, then exposes its own dependency-aware readiness result.
5. Web waits for API readiness.

API, indexer, and moderation all receive the same database authority. The API
datasource and web data mode are literal production values, not overridable
fixture defaults.

## Fail-closed configuration

Both manifests refuse to render without injected database credentials, a real
service DID, public origins, OAuth client metadata/callback URLs, a 32-byte
base64 session-encryption key, and the internal moderation token. No manifest
contains `did:example` or simulated-success defaults. Secret generation,
injection, rotation, and non-logging rules are documented in
`docs/operations/staging-secrets.md`.

## Runtime compatibility and image proof

The former Node 20 container emitted engine incompatibilities for current AT
Protocol packages. The shared base is now Node 22 Alpine, includes every
workspace manifest required by the lockfile, and installs with `npm ci`.
API, indexer, moderation, and web runtime targets all built successfully. The
web build explicitly used `VITE_DATA_MODE=api`.

## Migration execution

A disposable, unexposed Compose project and isolated volume ran the three
containerized migration jobs against an empty PostgreSQL 16 database:

- API: 11 applied;
- indexer: 3 applied;
- moderation: 2 applied.

The project and volume were removed immediately afterward. Independent replay
reported 11, 3, and 2 migrations skipped with no checksum drift.

## Verification

- Rendered production/staging manifest contract: 3 passed.
- Database-enabled repository gate: 832 passed.
- PostgreSQL/HTTP integration: 24 passed.
- Direct service integration: 9 passed.
- Chromium: 39 passed, 1 externally gated journey skipped.
- Coverage: 58.24% statements, 45.95% branches, 51.50% functions, 59.46% lines.
- Workspace build and high-severity dependency audit: passed; one known low
  Windows-only development-server advisory remains.

## Subsequent external proof

Tasks 7.2 and 7.3 later published and signed the four-image set, deployed exact
digests, exercised rollback, restored PostgreSQL into an empty target, fired
the indexer-disconnect alert, and repeated the two-account browser journey on
the authorized NUC staging host. Same-host durability, protected GHCR/OIDC
promotion, and human ownership remain outside this topology evidence.
