# Phase 3 core durability evidence

Date: 2026-07-11

## Demonstrated

- PostgreSQL migrations `0003` through `0011` apply from an empty database and
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
- Production moderation startup requires PostgreSQL and verifies the queue
  schema before listening; queue state, leases, retries, policy decisions, and
  immutable audit history survive repository reconstruction.
- Moderation migrations apply from empty, are checksum-protected, replay
  without changes, and must complete successfully before the worker starts in
  both production and staging Compose.

## Verification commands

```text
npm run db:migrate -w @patchwork/api
npm run test:integration:postgres -w @patchwork/api
TEST_DATABASE_URL=postgresql://... npm test -w @patchwork/moderation-worker
npm run check
```

The isolated PostgreSQL integration run used loopback port 5433 so the existing
home-network service on port 5432 remained untouched. Eleven migrations apply
and replay without changes; the focused Phase 3 run recorded 20 PostgreSQL/HTTP
integration tests, with later Phase 4 additions tracked separately.

Automatic repository-event reconciliation is now implemented by the persistent
indexer. Validated status/delete events reconcile compatible private state
before checkpointing; stale events are ignored, divergence is recorded, and a
post-projection failure is redelivered. See
`../phase-5/repository-event-reconciliation.md`.

## Moderation durability checkpoint

On 2026-07-11, isolated PostgreSQL integration demonstrated two concurrent
moderation workers claiming distinct queued subjects through
`FOR UPDATE SKIP LOCKED`. Follow-up PostgreSQL tests prove ownership-checked
acknowledgement/failure, retry backoff, terminal exclusion, and recovery at the
lease-expiry boundary. Durable audit/policy transactions were then verified:
queue state and immutable audit insert commit atomically,
sequential and concurrent duplicate commands return one recorded action, and a
new repository instance reads the same trail. The final runtime slice proved
empty migration/replay, schema-guarded production construction, durable restart
readback, and valid production/staging Compose dependency graphs. Eleven focused
moderation PostgreSQL/runtime tests passed in the combined deterministic gate.
