# Durable directory projection evidence

Date: 2026-07-26

## Scope

This slice replaces the production directory query's empty normalized-event
snapshot with a durable PostgreSQL projection sourced from
`app.patchwork.directory.resource` repository events.

## Runtime behavior

- Indexer migration `0004_directory_projection_store.sql` adds an independent,
  additive directory projection table and discovery/cursor indexes.
- The production Jetstream subscription accepts aid-post and
  directory-resource collections.
- Create and update events persist public directory fields, hashed author
  identity, content revision, searchable text, optional privacy-quantized
  geography, and source cursor/event identity.
- Delete events share the replay-safe hashed tombstone and event ledger used by
  aid posts.
- Rebuild reset covers both projection tables under the existing advisory lock.
- The API loads directory projections for every `/query/directory` request and
  applies the existing deterministic category, verification status,
  operational status, geography, freshness, search, and pagination contract.
- API and indexer startup fail closed when the new projection table is missing.

## Privacy and lifecycle

- Directory geography remains optional and, when present, retains the shared
  one-kilometre minimum public precision.
- Raw author DIDs are not stored in the projection table; only SHA-256 hashes
  are retained, while the public AT URI remains the record identifier.
- Account export includes only the caller's directory projections.
- Account deactivation deletes projections owned by the deactivated DID and
  prevents later live or rebuild replay from restoring them.
- The migration is additive. The previous application revision can run while
  the table exists, so deployment requires no destructive down migration.

## Verification

- Fresh PostgreSQL 16 migration application: API 13, indexer 4, moderation 3.
- Immediate indexer migration replay: 4 skipped, checksum-clean.
- Focused isolated-PostgreSQL gate:
  - indexer projection store: 10 passed;
  - API query, public HTTP discovery, and account privacy: 9 passed.
- Full non-database repository gate: lint, typecheck, maps, and 875 tests
  passed; 66 database-only tests were skipped.
- Full database-enabled repository gate: 941 tests passed with no skips.
- Production build completed for every workspace, including the Vite web
  application.

## Remaining boundary

This is durable local/runtime evidence, not the Phase 5 controlled live-event
proof. A disposable directory record must still traverse the authorized PDS,
Jetstream, indexer, PostgreSQL query, and rendered browser path. Production
directory authoring and partner-verification administration also remain
separate future slices.
