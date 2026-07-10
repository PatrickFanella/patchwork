# Patchwork domain map

The alpha data-placement authority is ADR 0003: `docs/architecture/adr/0003-at-alpha-data-boundaries.md`. Current implementation maturity is tracked separately in `docs/architecture/current-state-matrix.md`.

## Alpha bounded contexts

| Domain | Authority | Primary runtime owner | Public interface | Alpha notes |
| --- | --- | --- | --- | --- |
| Identity | User account/PDS for DID identity; Patchwork PostgreSQL for encrypted session material | `services/api` | OAuth login, callback, current session, logout | Browser never receives refresh material; fixture auth is test-only. |
| Aid-post record | User AT repository | `services/api` command boundary | Authenticated create/update/close/delete | Only `app.patchwork.aid.post` is written on-protocol in alpha. |
| Ingestion | Repository authority observed through Jetstream plus reconciliation | `services/indexer` | Internal event-source interface and health/metrics | Jetstream is a live delivery source, not historical authority. |
| Discovery projection | Rebuildable Patchwork PostgreSQL read model | `services/indexer` writes; `services/api` reads | Map and feed queries | Contains public coarse location only; projection can be dropped and rebuilt. |
| Private request workflow | Patchwork PostgreSQL | `services/api` | Authenticated lifecycle commands and user views | Triage, assignment, audit, idempotency, and synchronization state are private. |
| Geoprivacy | Public record policy plus encrypted private store when exact location is essential | `services/api`, `services/indexer`, `packages/shared` | Separate public and private location inputs | Public minimum precision is 1 km. Exact location never enters AT or public projection. |
| Blocks and reports | Patchwork PostgreSQL | `services/api` | Authenticated block/report commands | Never published through the moderation-report lexicon in alpha. |
| Moderation | Patchwork PostgreSQL queue, case, and audit state | `services/moderation-worker` | Private operator APIs and user-safe outcomes | Moderation controls Patchwork visibility; it does not silently rewrite user repositories. |
| Observability | Metrics backend and redacted operational logs | All runtime services | Health, readiness, metrics, alerts | Aggregates and redacted references only. |

## Data flow

1. The user authenticates through AT OAuth; encrypted session material is stored privately.
2. The API validates an aid-post command, separates private location input, quantizes the public location, and writes the public record to the user’s PDS.
3. Jetstream delivers the repository operation to the indexer.
4. The indexer validates the record and transactionally updates the PostgreSQL projection and cursor.
5. The API serves map/feed results from the projection and private workflow views from operational tables.
6. Delete events remove the public projection and trigger deletion of fulfillment secrets while retaining only policy-approved private audit metadata.

## Anti-corruption boundaries

- `packages/at-client` adapts official AT client/OAuth types into Patchwork command and session interfaces.
- `services/indexer/src/stream` adapts Jetstream or future firehose frames into one normalized event-source interface.
- `packages/at-lexicons` validates public record payloads before domain code consumes them.
- `packages/shared` owns transport-neutral domain contracts; it must not import service persistence or AT SDK types.
- Public record models and private location/report/case models use separate types so sensitive fields cannot be spread into public payloads.

## Deferred contexts

Chat, volunteer profiles, directory partners, verification, notifications, scheduling, groups, organizations, reputation, matching, offline sync, native mobile, multi-region tenancy, and external connectors are outside the alpha. Their existing code remains prototype/design material and cannot introduce alpha runtime dependencies.
