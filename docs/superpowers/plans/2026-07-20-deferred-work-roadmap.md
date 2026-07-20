# Deferred Work Roadmap

> **For agentic workers:** Execute this roadmap in order. Use bite-sized checkboxes, keep each phase evidence-driven, and do not treat any local-green result as a launch decision.

**Goal:** Concentrate the still-open work into a prioritized, evidence-backed roadmap that first ships the interactive map and then closes the remaining external proof gates for live AT, OAuth/browser, staging operations, and alpha decision-making.

**Architecture:** Keep the narrow alpha boundary fixed. The map work must preserve privacy-safe approximate geography and the existing list/detail UX; the later phases must prove live AT ingestion, real browser OAuth, immutable staging, recovery/alerting game days, and an independent launch review before any expansion feature is reconsidered. Expansion work stays frozen until the alpha gates pass.

**Evidence standard:** Every checkbox below must end with a committed artifact or a command transcript in `docs/operations/evidence/`.

---

## Roadmap ordering

1. **Execute now:** interactive map + privacy-safe self-hosted US basemap.
2. **Phase 5 proof:** controlled live AT indexing/projection proof.
3. **Phase 6 proof:** two-browser real OAuth/full workflow proof.
4. **Phase 7 proof:** immutable staging / rollback / restore / alert gameday and ownership.
5. **Phase 8 proof:** independent accessibility / privacy / capacity / launch decision.
6. **PDS operations:** SMTP recovery, encrypted off-host backups, storage monitoring, patch cadence, and remove the derived image once upstream oauth-provider >=0.19.6 ships.
7. **Frozen expansion portfolio:** reconsider only after the alpha gates pass.

## Existing evidence this roadmap depends on

- Phase 5 projection-backed discovery evidence: `docs/operations/evidence/phase-5/projection-discovery.md`
- Phase 5 live event-source evidence: `docs/operations/evidence/phase-5/live-event-source.md`
- Phase 5 durable projection evidence: `docs/operations/evidence/phase-5/durable-projections.md`
- Phase 6 authentication UX evidence: `docs/operations/evidence/phase-6/authentication-ux.md`
- Phase 6 local browser journey evidence: `docs/operations/evidence/phase-6/alpha-browser-journey-local.md`
- Phase 6 production data-mode evidence: `docs/operations/evidence/phase-6/production-data-mode.md`
- Phase 7 persistent topology evidence: `docs/operations/evidence/phase-7/persistent-topology.md`
- Phase 7 immutable delivery evidence: `docs/operations/evidence/phase-7/immutable-delivery.md`
- Phase 7 recovery and alerting evidence: `docs/operations/evidence/phase-7/staging-readiness.md`
- Phase 8 alpha go/no-go review: `docs/operations/evidence/phase-8/alpha-go-no-go.md`
- Phase 8 final continuation report: `docs/operations/evidence/phase-8/final-continuation-report.md`
- Phase 8 accessibility audit: `docs/operations/evidence/phase-8/accessibility-audit.md`
- Phase 8 local capacity probe: `docs/operations/evidence/phase-8/local-capacity-probe.md`
- Phase 8 retention enforcement: `docs/operations/evidence/phase-8/retention-enforcement.md`
- PDS signup deployment evidence: `docs/operations/evidence/pds-signup-deployment.md`
- Quality review: `docs/operations/evidence/quality-review.md`
- Decision matrix: `docs/EXPANSION_DECISION_MATRIX.md`

## Phase A — Interactive map + privacy-safe self-hosted US basemap

### Why this is first

- `apps/web/src/features/frontend-shell.tsx:277-299` currently fabricates a fallback map location and a fake 300m precision.
- `apps/web/src/map-ux.ts:101-175` already enforces a 300m floor for markers, but the new public map requirement raises the minimum to 1km and removes exact-pin behavior.
- `packages/shared/src/privacy.ts:16-29` already defines `PUBLIC_MIN_PRECISION_KM = 1`, which can become the map floor.
- `apps/web/src/features/api-client.ts:862-947` and `apps/web/src/feed-ux.ts:86-106` already carry approximate geography into UI models.
- `docker/nginx/patchwork-web.conf` currently serves only `/assets/` and `/`.

### Scope

- Real interactive map using Leaflet + protomaps-leaflet.
- Same-origin, self-hosted `/tiles/us.<sha256>.pmtiles` basemap artifact.
- United States coverage only.
- Preserve semantic list/detail fallback.
- Lazy-load map code only on `/map`.
- Retain server `approximateGeo.precisionKm` and enforce `>= 1km`.
- Render circles/clusters, never exact pins.
- Remove fabricated fallback location and 300m precision.
- Distinguish no records, no location, API failure, and tile failure.
- Bind selection between map, list, and drawer.

### Acceptance evidence

- [x] `npm run check` passes with map unit tests and tile script tests.
- [x] `npm run test -w @patchwork/web -- map-ux.test.ts` passes.
- [x] `npm run build -w @patchwork/web` produces a lazy-loaded map chunk and no exact-pin fallback.
- [x] Nginx serves `/tiles/us.<sha256>.pmtiles` with Range support and immutable caching; byte-range requests return 206 and `/tiles/us.pmtiles` returns 404.
- [x] The map route renders the basemap even for zero records; automated tests prove approximate circles/clusters, and records without usable geography retain the semantic list/detail fallback.

### Non-goals

- No exact-address disclosure.
- No global basemap coverage.
- No geocoding service.
- No live aid-request creation.
- No expansion of feed semantics beyond map discovery.

### Verification artifacts / commands

- `npm run test -w @patchwork/web -- map-ux.test.ts`
- `npm run test -w @patchwork/web -- map-ux`
- `npm run build -w @patchwork/web`
- `curl -I http://localhost/tiles/us.<sha256>.pmtiles`
- `curl -r 0-1023 -I http://localhost/tiles/us.<sha256>.pmtiles`

## Phase 5 — Controlled live AT indexing/projection proof

### Dependency chain

- Uses the durable projection and live-source foundation already evidenced in `docs/operations/evidence/phase-5/durable-projections.md` and `docs/operations/evidence/phase-5/live-event-source.md`.
- Must prove the controlled live path, not just local loopback or fixture-backed behavior.

### Required proof

- [ ] Disposable AT account real create/update/delete events traverse the controlled Jetstream/staging path.
- [ ] Map/feed/query projection reads come from the durable indexer table, not a process-local fallback.
- [ ] Rebuild equivalence is demonstrated after live ingestion.
- [ ] Cursor, freshness, and dead-letter behavior are captured in committed evidence.

### Acceptance evidence

- [ ] Controlled live event replay evidence under `docs/operations/evidence/phase-5/`.
- [ ] `npm run check` and `npm run build` on the impacted workspace remain green.
- [ ] The external proof includes record URIs, redacted responses, and projection/rebuild comparison results.

### Explicit non-goals

- No new alpha features.
- No expansion to groups, matching, or connectors.
- No acceptance of fixture-only proof as phase closure.

## Phase 6 — Two-browser real OAuth/full workflow proof

### Dependency chain

- Builds on `docs/operations/evidence/phase-6/authentication-ux.md`, `alpha-browser-journey-local.md`, and `production-data-mode.md`.
- Requires the browser shell to stay fixture-free in production and the server to preserve privacy-safe approximate geography.

### Required proof

- [ ] Two disposable browser sessions complete real OAuth against disposable PDS accounts.
- [ ] End-to-end flow covers create, discover, workflow, report, block, close, and delete.
- [ ] No fixture fallback is used in the deployed path.
- [ ] Failure artifacts are redacted and uploaded only with explicit approval.

### Acceptance evidence

- [ ] Committed staging/browser evidence under `docs/operations/evidence/phase-6/`.
- [ ] Browser traces show the authenticated DID, not token material.
- [ ] The production data mode remains `api`.

### Explicit non-goals

- No credential capture in logs.
- No public launch decision.

## Phase 7 — Immutable staging / rollback / restore / alert gameday and ownership

### Dependency chain

- Depends on `docs/operations/evidence/phase-7/persistent-topology.md`, `immutable-delivery.md`, `staging-readiness.md`, `docs/operations/rollback-policy.md`, `docs/operations/disaster-recovery.md`, and `docs/operations/alerting-policy.md`.
- Must be executed on authorized staging only.

### Required proof

- [ ] Signed digest publication and staging deployment of the four-service set.
- [ ] Rollback to previous digests without incompatible down migration.
- [ ] Restore into a separate empty staging database with measured RTO/RPO.
- [ ] Indexer-disconnect and database-loss game days route, acknowledge, and resolve alerts.
- [ ] Named owners accept product, engineering, infrastructure, privacy, trust-and-safety, and on-call responsibilities.

### Acceptance evidence

- [ ] Staging recovery log in `docs/operations/evidence/phase-7/`.
- [ ] Alert timestamps, acknowledgements, and resolution notes in `docs/operations/game-day-log.md`.
- [ ] Host scripts and rollback records prove digest-only promotion.

### Explicit non-goals

- No mutable image tags.
- No hidden manual rollback.
- No unauthenticated staging exercise.

## Phase 8 — Independent accessibility / privacy / capacity / launch decision

### Dependency chain

- Depends on the Phase 6 and Phase 7 proof sets and the current no-go evidence in `docs/operations/evidence/phase-8/alpha-go-no-go.md` and `final-continuation-report.md`.

### Required proof

- [ ] Independent WCAG 2.2 / assistive-technology review completes with no unresolved launch blocker.
- [ ] Formal privacy approval covers backup, deletion, retention, and suppression boundaries.
- [ ] Sustained staging capacity test covers read/write/ingestion/moderation headroom.
- [ ] Product decision records a current go/no-go with named owners.

### Acceptance evidence

- [ ] New independent audit artifact committed under `docs/operations/evidence/phase-8/`.
- [ ] Updated go/no-go review references the reviewed evidence set.

### Explicit non-goals

- No launch by optimism.
- No reclassification of local-only evidence as external proof.

## PDS operations backlog

### Items

- [ ] Configure and validate SMTP recovery for password/login recovery.
- [ ] Enable encrypted off-host backups with restore verification.
- [ ] Add storage monitoring and alerts for backup, disk, and retention health.
- [ ] Enforce patch cadence and prove alerting for stale components.
- [ ] Remove the derived image once the official oauth-provider `>=0.19.6` is available and adopted.

### Evidence anchors

- `docs/operations/evidence/pds-signup-deployment.md` already calls out SMTP as a follow-up.
- `docs/operations/disaster-recovery.md` and `docs/operations/alerting-policy.md` define the backup/restore and alert contract.

### Non-goals

- No PDS ownership changes to Patchwork alpha scope.
- No public account-creation exposure.

## Frozen expansion portfolio

Frozen until the alpha gates pass:

- groups
- reputation scoring
- organization portals
- volunteer scheduling
- native mobile
- multi-region operation
- external connectors
- attachments
- automated matching

### Reconsideration rule

- [ ] Re-open expansion only after Phase 6, 7, and 8 exit gates are fully evidenced and the go/no-go decision is positive.
- [ ] Any reconsideration must cite `docs/EXPANSION_DECISION_MATRIX.md` and the current go/no-go record.
