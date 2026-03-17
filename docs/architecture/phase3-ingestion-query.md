# Phase 3 ingestion, indexing, query, and ranking (P3.1-P3.4)

This document captures the Phase 3 implementation scope for roadmap issue #41.

## Modules

- Ingestion + normalization: `packages/shared/src/firehose.ts`
- Indexing + query: `packages/shared/src/discovery.ts`
- Ranking pipeline: `packages/shared/src/ranking.ts`
- Indexer adapter: `services/indexer/src/pipeline.ts`
- API adapter: `services/api/src/query-service.ts`

## Firehose consumer and normalization

`FirehoseConsumer` ingests event envelopes with:

- `seq`
- `action` (`create | update | delete`)
- `uri`
- `collection`
- optional record payload

Normalization outputs deterministic `eventId`s (`${seq}:${uri}:${action}`), classifies failures as:

- `MALFORMED_EVENT`
- `PARTIAL_EVENT`
- `VALIDATION_FAILED`

Replay uses identical fixture streams and yields byte-equivalent normalized event arrays.

## Index strategy

`DiscoveryIndexStore` maintains in-memory indexes:

- **Geo buckets** (approximate only)
- **Full-text term index**
- **Category index**
- **Status index**
- **Urgency index**

Lifecycle behavior:

- `create` -> insert record and index terms
- `update` -> remove previous terms, re-index latest payload
- `delete` -> remove record from all indexes

No exact coordinates are emitted through query outputs; map/feed responses contain only quantized approximate coordinates.

## Query APIs

API routes:

- `GET /query/map`
- `GET /query/feed`
- `GET /query/directory`

Supported server-side filters:

- `radiusKm`
- `category`
- `urgency`
- `freshnessHours`
- `status`
- `searchText`
- `page`, `pageSize`

Validation errors return a consistent `INVALID_QUERY` shape with issue details.

## Ranking formula and tunables

Ranking is deterministic and computed in query path (`map` + `feed`) using:

- Distance band score
- Recency decay score
- Trust score

Weights (`packages/shared/src/ranking.ts`):

- `distanceBand = 0.45`
- `recency = 0.35`
- `trust = 0.20`

Distance bands:

- `<= 2km => 1.00`
- `<= 5km => 0.82`
- `<= 10km => 0.66`
- `<= 25km => 0.48`
- `> 25km => 0.30`

Recency uses exponential decay with half-life `24h`.

Tie-breaking order:

1. `finalScore` descending
2. `updatedAt` descending
3. `uri` ascending

## Test coverage

- `packages/shared/src/firehose.test.ts`
- `packages/shared/src/discovery.test.ts`
- `packages/shared/src/ranking.test.ts`
- `services/indexer/src/phase3.test.ts`
- `services/api/src/phase3.test.ts`

These cover malformed/partial events, deterministic replay, index lifecycle updates, filter correctness, pagination stability, ranking determinism, and regression-sensitive ordering.
