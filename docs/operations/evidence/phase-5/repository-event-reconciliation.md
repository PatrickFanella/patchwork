# Repository-event lifecycle reconciliation

Date: 2026-07-11

Result: **automatic local reconciliation complete; controlled live-AT proof
still required**.

## Production behavior

The persistent indexer now subscribes only to the narrow-alpha
`app.patchwork.aid.post` collection. After a normalized event is durably
applied to the projection, `PostgresLifecycleEventReconciler` runs before the
event cursor is checkpointed or acknowledged.

- Repository deletions remove the matching private workflow and cascading
  assignment/handoff state, retaining one minimal one-year audit marker.
- Compatible `in-progress`, `resolved`, and `closed` repository statuses move
  private workflow state forward and persist observed public status/CID.
- A public status that would regress or skip an incompatible private workflow
  does not change private state; it records `PUBLIC_STATUS_DIVERGED` for
  operator follow-up.
- Event IDs make status transitions and deletion audit markers idempotent.
- URI advisory locks and projection source-cursor/event checks prevent stale
  or superseded repository events from changing lifecycle state.
- If reconciliation fails after projection commit, the cursor remains
  unacknowledged. Redelivery reuses the durable projection/tombstone and
  completes reconciliation before checkpointing.
- Actor identity is derived from the normalized AT URI and must match the
  validated event author. No browser-supplied identity, token, exact location,
  record body, or private moderation data enters reconciliation audit payloads.

Production and staging Compose now require API migrations to finish before the
indexer starts, because reconciliation deliberately uses the shared durable
lifecycle and audit schema. Startup also fails closed if those tables are
missing.

## Behavioral evidence

Five PostgreSQL integration cases prove:

1. repository deletion removes a workflow before cursor persistence;
2. a resolved update advances an open workflow once across duplicate delivery;
3. incompatible public regression records divergence without private rollback;
4. stale projection events cannot overwrite the current lifecycle checkpoint;
5. a reconciliation outage prevents checkpointing and succeeds on redelivery.

The indexer workspace serializes PostgreSQL-owning test files because they
intentionally share one disposable schema. This removes cross-file TRUNCATE
races without weakening any runtime concurrency test.

## External boundary

The 2026-07-28 controlled two-account browser journey subsequently observed
the complete aid create, update/close, and delete sequence through the home
PDS, NUC-local Jetstream, PostgreSQL projection, lifecycle reconciler, and
browser. Phase 5 and Phase 6 external behavior is therefore proven on the
controlled home-network runtime; protected staging repetition and operational
drills remain Phase 7 work.
