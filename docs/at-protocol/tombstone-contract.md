# Tombstone/delete propagation contract (Phase 2 / P2.4)

This document defines delete semantics for downstream ingestion consumers.

## Module

- `packages/shared/src/records.ts`

## Tombstone representation

A deleted record is represented as:

- `$type`: `app.patchwork.system.tombstone`
- `uri`: original AT URI
- `collection`: original record NSID
- `deletedByDid`: DID that initiated deletion
- `reason`: short reason string
- `deletedAt`: ISO datetime
- `previousVersion`: version prior to delete mutation

## Lifecycle semantics

1. Record exists in `active` lifecycle.
2. Delete operation produces a deterministic tombstone.
3. Record lifecycle transitions to `tombstoned`.
4. `record.deleted` mutation event is emitted.
5. Active lookups no longer return deleted records.
6. Recreate/update attempts on tombstoned URI are rejected.

## Downstream guarantees

- Delete propagation emits exactly one canonical tombstone payload for a URI.
- Mutation event serialization round-trips through JSON parser/validator.
- Consumers can treat tombstone payload as authoritative removal signal.

## Caveats

- Query endpoint behavior and ranking/index effects are Phase 3 concerns.
- This phase defines mutation contract guarantees only.

## Test evidence

- `packages/shared/src/records.test.ts`
    - tombstone deterministic creation
    - round-trip mutation serialization/deserialization
    - regression protection against deleted record resurfacing
