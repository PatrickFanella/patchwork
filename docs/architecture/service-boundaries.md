# Patchwork service boundaries

This document defines the target boundaries for the continuation alpha. ADR 0003 governs data placement; the current-state matrix records how far the implementation is from these boundaries.

## `apps/web`

- Initiates AT OAuth through `services/api`; it does not handle refresh tokens.
- Sends authenticated aid-post commands and renders map/feed queries.
- Collects public approximate location separately from optional private fulfillment location.
- Never talks directly to the indexer, moderation worker, database, or Jetstream.
- Does not fall back to fixtures in staging or production.

## `services/api`

- Terminates the Patchwork HTTP boundary and derives principals from real AT sessions.
- Owns encrypted session persistence and authenticated command authorization.
- Writes aid-post records to the user’s PDS through `packages/at-client`.
- Reads rebuildable discovery projections but does not edit them as record authority.
- Owns private lifecycle, block, report, exact-location, idempotency, and audit repositories.
- Sends durable moderation work through a PostgreSQL-backed queue.
- Exposes no token, exact-location, report-evidence, or operator-note data in public responses.

## `services/indexer`

- Consumes filtered `app.patchwork.aid.post` operations from Jetstream through a provider-neutral event-source interface.
- Reconciles/backfills repository state rather than treating a stream cursor as complete authority.
- Validates lexicons and geoprivacy policy before writing projections.
- Transactionally stores normalized projections, delete state, dead letters, and cursor progress.
- Does not own sessions, private request workflow, moderation decisions, or exact location.

## `services/moderation-worker`

- Claims durable moderation jobs with crash-safe leases and idempotent decisions.
- Owns private case processing and append-only moderation audit entries.
- Changes Patchwork visibility and safety state, not user repository records.
- Emits aggregate/redacted metrics and never exposes raw evidence through health endpoints.

## `packages/at-client`

- Wraps the official AT OAuth and repository clients.
- Resolves session/PDS operations and performs aid-post create, get, update, and delete.
- Returns Patchwork-owned result and error types so AT SDK types do not leak across the codebase.
- Contains no product workflow, projection, moderation, or UI logic.

## `packages/at-lexicons`

- Stores canonical public record definitions and validators.
- Enforces the alpha aid-post public-location constraints.
- Retains deferred schemas for compatibility/design history without enabling runtime writes.

## `packages/shared`

- Owns transport-neutral domain contracts, validation helpers, privacy/redaction rules, and configuration schemas.
- Contains no database clients, HTTP server state, official AT clients, or browser framework code.
- Keeps public and private data contracts structurally distinct.

## PostgreSQL ownership

Logical schemas or clearly separated table groups enforce ownership:

| Data | Writer | Reader |
| --- | --- | --- |
| OAuth sessions | API | API only |
| Command/idempotency audit | API | API and authorized operators |
| Public discovery projection | Indexer | API |
| Stream cursor and dead letters | Indexer | Indexer and authorized operators |
| Private lifecycle, blocks, reports, exact location | API | API and narrowly authorized moderation paths |
| Moderation queue and case audit | API enqueue; moderation worker decisions | Moderation worker and authorized operator API |

Services use separate database roles in staging and production. A service must not gain write access to another service’s tables merely because the alpha uses one PostgreSQL cluster.

## Cross-service contracts

- API-to-PDS writes are synchronous commands with idempotency and explicit partial-failure results.
- Repository-to-indexer delivery is asynchronous and eventually consistent.
- API-to-moderation delivery is a durable database queue until a separate broker is justified.
- Indexer-to-API discovery integration is PostgreSQL read-model access with projection-freshness metadata.
- No service infers successful downstream work from an in-memory event or an HTTP `200` health response.

## Deferred services and topology

The existing mobile, multi-region, connector, notification, scheduling, group, matching, reputation, organization, and richer chat models do not define deployed alpha services. Reintroducing one requires an evidence-backed post-alpha slice with explicit persistence, authorization, privacy, and operational ownership.
