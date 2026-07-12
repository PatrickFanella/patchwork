# Phase 5 live event-source evidence

Date: 2026-07-11

## Proven in this slice

- The production indexer requires `DATABASE_URL` or `INDEXER_DATABASE_URL`; it
  no longer starts a fixture pipeline when persistence is absent.
- `JetstreamEventSource` connects to the configured WebSocket endpoint with all
  Patchwork collection NSIDs as `wantedCollections` filters and advertises a
  bounded `maxMessageSizeBytes`.
- Jetstream commit frames are validated and adapted to the existing ingestion
  envelope. Identity/account frames and unselected collections are not
  delivered to the pipeline.
- The source starts from the PostgreSQL checkpoint, acknowledges a cursor only
  after pipeline processing succeeds, and reconnects from the prior cursor if
  processing fails.
- Reconnect delay uses bounded exponential backoff with jitter. Duplicate and
  out-of-order frames are suppressed; malformed and oversized frames are
  rejected.
- Readiness reports a disconnected event source as not ready. Prometheus and
  JSON metrics expose connection state, lag, reconnects, and rejected frames.
- `SIGTERM`/`SIGINT` shutdown stops the source, waits for queued message work,
  forces the final checkpoint, stops HTTP acceptance, and closes PostgreSQL.
- Main and staging Compose configurations give the indexer PostgreSQL access
  and use the official public Jetstream subscription URL documented by
  [Bluesky](https://docs.bsky.app/docs/advanced-guides/firehose).

## Behavioral evidence

`services/indexer/src/stream/jetstream-source.test.ts` uses a real loopback
WebSocket server and covers:

- reconnect and cursor resume;
- Patchwork collection filtering;
- processing-failure redelivery without cursor advancement;
- duplicate and out-of-order suppression;
- malformed and oversized rejection; and
- shutdown without reconnect.

`services/indexer/src/runtime.test.ts` proves the durable cursor is supplied to
the source and an accepted event is checkpointed during shutdown.

## Verification

- API migrations from empty: 11 applied; immediate replay: 11 skipped.
- Moderation migrations from empty: 2 applied; immediate replay: 2 skipped.
- `TEST_DATABASE_URL=... npm run check`: 825 tests passed across 78 files.
- `npm run build`: passed.
- `npm run test:coverage`: passed; 64.74% statements, 51.15% branches,
  58.37% functions, and 65.88% lines.
- `npm run test:integration:service -w @patchwork/web`: 9 passed.
- `npm run test:e2e -w @patchwork/web`: 33 Chromium cases passed.
- `npm audit --omit=dev`: zero vulnerabilities.
- Both Compose files render successfully with isolated placeholder secrets.

The PostgreSQL verification container was bound only to `127.0.0.1:5433`; the
existing home-network service on port 5432 was not modified.

## Not yet proven

This completes Task 5.1, not Phase 5. Normalized projections and dead letters
remain process-local or absent, discovery does not yet read the indexer’s
projection database, and no controlled public-Jetstream aid-post lifecycle has
been demonstrated. Those are Tasks 5.2, 5.3, and the Phase 5 exit gate.
