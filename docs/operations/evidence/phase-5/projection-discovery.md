# Phase 5 projection-backed discovery evidence

Date: 2026-07-11

## Production query boundary

- PostgreSQL API mode constructs `PostgresProjectionQueryService`; it no
  longer loads `discovery_events` into a process-local store at startup.
- Each map/feed request reads `indexer_aid_post_projections`, converts only the
  privacy-safe normalized fields into the shared discovery contract, and then
  applies approximate geography, category, urgency, lifecycle status,
  freshness, text search, deterministic ranking, and bounded pagination.
- Fixture discovery remains available to tests, but non-test authentication
  startup already requires PostgreSQL and therefore cannot silently select it.
- Directory queries return the narrow alpha's empty durable view rather than
  falling back to fixture directory records.

## Freshness and startup safety

- Indexer migration `0003_projection_freshness.sql` adds a singleton cursor
  and heartbeat row.
- The indexer writes a heartbeat at startup, after every accepted or
  quarantined event, and every ten seconds while running. This distinguishes a
  healthy quiet stream from a stale indexer without altering record timestamps.
- Discovery responses include the latest observed cursor, latest projection
  time, heartbeat observation time, and lag seconds.
- API health/readiness reports missing or excessive projection lag as
  `not_ready`. `API_MAX_PROJECTION_LAG_SECONDS` defaults to 300 and is bounded
  by configuration validation.
- Main and staging Compose wait for the indexer migration and a healthy spool
  before starting the API. The API independently fails startup when either
  projection table is missing, freshness is unavailable, or lag is excessive.

## Behavioral evidence

The real PostgreSQL query suite proves:

- map/feed rows come from the durable projection table;
- approximate radius, category, urgency, status, freshness, and text filters;
- stable deterministic pagination across repeated requests; and
- cursor/heartbeat freshness metadata.

The readiness unit suite proves unavailable, stale, and exact-threshold
behavior. Separate startup commands against the isolated database proved:

- a current heartbeat imports the PostgreSQL API runtime successfully; and
- a heartbeat one hour old is rejected with
  `FATAL: Projection lag exceeds 300 seconds`.

## Verification

- Indexer migrations from empty: 3 applied; immediate replay: 3 skipped.
- API migrations from empty: 11 applied; immediate replay: 11 skipped.
- Moderation migrations from empty: 2 applied; immediate replay: 2 skipped.
- Database-enabled `npm run check`: 833 tests passed.
- `npm run build`: passed.
- Diagnostic coverage: 792 passed and 41 database tests skipped; 58.92%
  statements, 46.48% branches, 52.10% functions, and 60.05% lines.
- Direct service integration: 9 passed.
- Chromium browser accessibility: 33 passed.
- `npm audit --omit=dev`: zero vulnerabilities.

The PostgreSQL container was isolated on `127.0.0.1:5433` and removed after
verification. The existing home-network database on port 5432 was untouched.

## Remaining Phase 5 evidence

Tasks 5.1–5.3 are implemented locally. Phase 5 is not closed until a disposable
AT account's real create, update, and delete events traverse the controlled
Jetstream/staging path into map/feed, followed by a rebuild-equivalence check.
No local fixture or loopback test is claimed as that external proof.
