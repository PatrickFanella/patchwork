# Phase 3 core durability evidence

Date: 2026-07-11

## Demonstrated

- PostgreSQL migrations `0003` through `0010` apply from an empty database and
  replay without changes.
- Lifecycle registration, ordered transitions, assignment, acceptance,
  decline, timeout, handoff, deletion reconciliation, and public-status sync
  state survive repository reconstruction.
- Transition, assignment, response, timeout, handoff, deletion, and successful
  public-sync checkpoints use command-level idempotency.
- Public synchronization stores only stable failure codes and exposes
  `pending`, `failed`, and `synced` state to lifecycle queries.
- Competing transitions serialize on the workflow row so only one revision
  wins, and simultaneous delivery of one assignment command produces one
  assignment event.
- Blocks and reports derive their actor from the authenticated session and use
  PostgreSQL retention/deletion behavior.
- Platform roles resolve by authenticated DID and default to `user`.

## Verification commands

```text
npm run db:migrate -w @patchwork/api
npm run test:integration:postgres -w @patchwork/api
npm run check
```

The isolated PostgreSQL integration run used loopback port 5433 so the existing
home-network service on port 5432 remained untouched. Ten migrations applied,
the replay skipped all ten, and 20 PostgreSQL/HTTP integration tests passed.

## Remaining before the Phase 3 exit gate

- Implement durable moderation queue and audit stores, including crash-safe
  leases and retry behavior.
- Connect automatic repository-event reconciliation during the live-indexer
  phase; the current public-status command is author initiated.

## Moderation durability checkpoint

On 2026-07-11, an isolated PostgreSQL integration test demonstrated two
concurrent moderation workers claiming distinct queued subjects through
`FOR UPDATE SKIP LOCKED`. This proves the claim primitive only; the production
worker remains fixture-backed. Follow-up PostgreSQL tests prove ownership-checked
acknowledgement/failure, retry backoff, terminal exclusion, and recovery at the
lease-expiry boundary. Durable audit/policy transactions and runtime wiring
remain.
