# Phase 5 durable projection evidence

Date: 2026-07-11

## Runtime behavior

- Indexer migration `0002_projection_store.sql` adds durable aid-post
  projections, applied-event idempotency, hashed deletion tombstones, and
  bounded dead letters.
- The production runtime refuses startup when the projection schema is absent.
  Main and staging Compose run the checksummed indexer migration job before the
  spool service.
- Jetstream CID and revision values now survive normalization and are stored
  with the record URI, SHA-256 author identifier, approximate geography,
  searchable fields, status, timestamps, and source cursor.
- Create, update, and delete application uses a PostgreSQL transaction and
  per-record advisory lock. A shared rebuild lock prevents ingestion from
  racing an exclusive rebuild reset.
- Duplicate event IDs are no-ops. Lower source cursors cannot replace newer
  projections or resurrect records behind a newer hashed tombstone.
- Deletes remove the public projection in the same transaction and retain only
  the URI hash, source cursor, and deletion time in the tombstone.
- Invalid normalized records are stored without their raw event. Diagnostics
  redact DIDs and AT URIs, are capped at 500 characters, and deduplicate by a
  one-way event fingerprint.
- The pipeline checkpoints only after the projection or dead letter is durable.
  A database failure rejects processing, leaves the cursor unchanged, and is
  retried by the event source.

## PostgreSQL evidence

`services/indexer/src/db/projection-store.test.ts` proves:

- privacy-safe create persistence;
- newer update, duplicate delivery, and stale cursor behavior;
- delete plus stale-replay prevention;
- bounded dead-letter quarantine without raw tokens or exact coordinates;
- live pipeline output reaches PostgreSQL before checkpointing;
- invalid records advance only after durable quarantine;
- reset and ordered replay produce identical projections; and
- a simulated database outage leaves the checkpoint unchanged and succeeds on
  redelivery.

## Verification

- Indexer migrations from empty: 2 applied; immediate replay: 2 skipped.
- API migrations from empty: 11 applied; immediate replay: 11 skipped.
- Moderation migrations from empty: 2 applied; immediate replay: 2 skipped.
- Database-enabled `npm run check`: 833 tests passed across 79 files.
- `npm run build`: passed.
- No-database diagnostic coverage: 794 passed and 39 database tests skipped;
  59.36% statements, 46.61% branches, 52.74% functions, 60.48% lines.
- `npm audit --omit=dev`: zero vulnerabilities.
- Main and staging Compose files render with isolated placeholder credentials.
- The existing 9 direct service-integration and 33 Chromium browser cases
  remained green from the immediately preceding Task 5.1 gate in this session.

The verification database was isolated on `127.0.0.1:5433`. The existing
home-network PostgreSQL service on port 5432 was not modified.

## Remaining Phase 5 work

The API still reads the older discovery-event source. Task 5.3 must make the
new projection table the exclusive production map/feed source, enforce stable
filters and pagination, expose freshness, and reject stale or missing schemas.
The Phase 5 exit gate also requires a controlled live AT create/update/delete
and rebuild demonstration.
