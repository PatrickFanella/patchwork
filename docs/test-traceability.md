# Requirement-to-Test Traceability Map

This document maps each platform requirement to the test suites that cover it.
It serves as the Phase 8 (P8.1) traceability artifact for the automated test matrix.

## Coverage Areas

| Area | Requirement IDs | Test files |
|---|---|---|
| Schema validation | P2.1 | `packages/at-lexicons/src/lexicons.test.ts` · `services/api/src/phase8.test.ts` · `services/indexer/src/phase8.test.ts` |
| Identity / DID auth | P2.2 | `packages/shared/src/identity.test.ts` |
| Record CRUD + tombstone | P2.3, P2.4 | `packages/shared/src/records.test.ts` |
| Firehose ingestion | P3.1 | `packages/shared/src/firehose.test.ts` · `services/indexer/src/phase3.test.ts` · `services/indexer/src/phase8.test.ts` |
| Discovery index | P3.2, P3.3 | `packages/shared/src/discovery.test.ts` |
| Ranking pipeline | P3.4 | `packages/shared/src/ranking.test.ts` · `services/api/src/phase8.test.ts` |
| Query API | P3.5 | `services/api/src/phase3.test.ts` |
| Chat routing | P5 | `packages/shared/src/messaging.test.ts` · `services/api/src/phase5.test.ts` · `services/api/src/phase8.test.ts` |
| Resource directory + volunteer onboarding | P6 | `packages/shared/src/volunteer-onboarding.test.ts` · `services/api/src/phase6.test.ts` |
| Moderation queue + policy | P7.1 | `packages/shared/src/moderation.test.ts` · `services/moderation-worker/src/phase7.test.ts` · `services/moderation-worker/src/phase8.test.ts` |
| Privacy / geo redaction | P7.2 | `packages/shared/src/privacy.test.ts` · `services/api/src/phase8.test.ts` · `services/moderation-worker/src/phase8.test.ts` |
| Anti-spam hardening | P7.3 | `services/api/src/phase7.test.ts` |
| Service contracts | P8.1 | `packages/shared/src/contracts.test.ts` · `services/api/src/phase8.test.ts` · `services/indexer/src/phase8.test.ts` · `services/moderation-worker/src/phase8.test.ts` |
| Runtime startup guards | W2 #98 | `packages/shared/src/config.test.ts` |
| SLI metrics | W2 #104 | `packages/shared/src/alerting.test.ts` |
| Rate limiting / CORS | W2 #103 | `services/api/src/rate-limiter.test.ts` · `services/api/src/cors.test.ts` |
| Moderation console | W2 #112 | `services/api/src/lifecycle-service.test.ts` |
| Unified inbox | W2 #118 | `services/api/src/inbox-service.test.ts` |
| Feedback + reporting | W2 #130 | `services/api/src/feedback-service.test.ts` |
| Offline sync | W2 #129 | `packages/shared/src/offline-sync.test.ts` |
| E2E contract path | W3 #99 | `apps/web/e2e/request-lifecycle.test.ts` · `apps/web/e2e/accessibility.spec.ts` |

---

## Detailed Mapping

### P2.1 – AT Protocol lexicon schemas

| Requirement | Test | File |
|---|---|---|
| All v1 lexicon documents defined | `defines all required v1 lexicon documents` | `packages/at-lexicons/src/lexicons.test.ts` |
| Valid fixtures pass validation | `accepts valid fixtures for each record type` | `packages/at-lexicons/src/lexicons.test.ts` |
| Invalid fixtures are rejected | `rejects invalid fixtures for each record type` | `packages/at-lexicons/src/lexicons.test.ts` |
| Phase 8 aid post fixture validates | `validates phase 8 aid post fixture against lexicon schema` | `services/api/src/phase8.test.ts` |
| Phase 8 directory fixture validates | `phase 8 directory resource fixture passes schema validation` | `services/indexer/src/phase8.test.ts` |

### P2.2 – DID auth / identity

| Requirement | Test | File |
|---|---|---|
| Login with handle creates session | `loginWithHandle creates a new session with JWT tokens` | `packages/shared/src/identity.test.ts` |
| Handle resolution failure | `failed handle resolution returns HANDLE_RESOLUTION_FAILED` | `packages/shared/src/identity.test.ts` |
| Token refresh | `refreshIfNeeded refreshes tokens before expiry` | `packages/shared/src/identity.test.ts` |
| Expired session error | `expired refresh token returns SESSION_EXPIRED` | `packages/shared/src/identity.test.ts` |

### P2.3 / P2.4 – Record CRUD + tombstone

| Requirement | Test | File |
|---|---|---|
| Create record | `createRecord validates payload and returns active state` | `packages/shared/src/records.test.ts` |
| Update with status transition | `updateRecord enforces valid aid-post status transitions` | `packages/shared/src/records.test.ts` |
| Delete emits tombstone | `deleteRecord emits a deterministic tombstone event` | `packages/shared/src/records.test.ts` |
| Tombstone prevents resurrection | `tombstoned record cannot be resurrected` | `packages/shared/src/records.test.ts` |
| Event round-trip | `mutation events serialise and deserialise deterministically` | `packages/shared/src/records.test.ts` |

### P3.1 – Firehose ingestion

| Requirement | Test | File |
|---|---|---|
| Process fixture stream | `ingest processes fixture streams deterministically` | `packages/shared/src/firehose.test.ts` |
| Replay determinism | `replay returns identical results across reruns` | `packages/shared/src/firehose.test.ts` |
| Malformed events classified | `ingest classifies malformed events` | `packages/shared/src/firehose.test.ts` |
| Normalise AT URI | `normalizeFirehoseEvent extracts author DID from AT URI` | `packages/shared/src/firehose.test.ts` |
| Pipeline ingest stats | `ingests fixture stream and updates index stats` | `services/indexer/src/phase3.test.ts` |
| Pipeline replay | `supports deterministic replay for fixture streams` | `services/indexer/src/phase3.test.ts` |
| Phase 8 ingest – zero failures | `ingests phase 8 fixture events with zero failures` | `services/indexer/src/phase8.test.ts` |
| Phase 8 ingest – index stats | `updates index stats accurately after phase 8 ingestion` | `services/indexer/src/phase8.test.ts` |
| Phase 8 replay determinism | `reproduces identical metrics on deterministic replay` | `services/indexer/src/phase8.test.ts` |

### P3.2 / P3.3 – Discovery index

| Requirement | Test | File |
|---|---|---|
| Create/update/delete lifecycle | `DiscoveryIndexStore handles create/update/delete lifecycle` | `packages/shared/src/discovery.test.ts` |
| Map query hides exact coords | `map queries never expose exact coordinates` | `packages/shared/src/discovery.test.ts` |
| Stable pagination | `queryFeed returns deterministic pagination` | `packages/shared/src/discovery.test.ts` |
| Directory filters | `queryDirectory applies category and status filters` | `packages/shared/src/discovery.test.ts` |

### P3.4 – Ranking

| Requirement | Test | File |
|---|---|---|
| Distance band scoring | `scores distance bands deterministically` | `packages/shared/src/ranking.test.ts` |
| Combined score | `combines distance, recency, and trust into a stable score` | `packages/shared/src/ranking.test.ts` |
| Tie-breaking | `keeps tie ordering deterministic using updatedAt then URI` | `packages/shared/src/ranking.test.ts` |
| Phase 8 ordering | `ranks phase 8 cards deterministically with closest/freshest first` | `services/api/src/phase8.test.ts` |
| Score stability across calls | `produces stable scores across independent calls` | `services/api/src/phase8.test.ts` |

### P5 – Chat routing

| Requirement | Test | File |
|---|---|---|
| Post-linked chat context | `createPostLinkedChatContext creates deterministic conversation URI` | `packages/shared/src/messaging.test.ts` |
| Routing rule matching | `DeterministicRoutingAssistant matches scenario to rule` | `packages/shared/src/messaging.test.ts` |
| Fallback when no AT capability | `exposes explicit fallback notice when recipient lacks AT-native capability` | `services/api/src/phase5.test.ts` |
| Idempotent conversation creation | `re-uses existing conversation for the same aid post and participants` | `services/api/src/phase8.test.ts` |
| Map-surface initiation | `initiates a deterministic conversation context from the map surface` | `services/api/src/phase8.test.ts` |

### P7.1 – Moderation queue + policy

| Requirement | Test | File |
|---|---|---|
| Enqueue review | `enqueueReview adds item with context` | `packages/shared/src/moderation.test.ts` |
| Apply policy action | `applyPolicyAction updates visibility and queue state` | `packages/shared/src/moderation.test.ts` |
| Appeal lifecycle | `appeal lifecycle: open → review → resolved` | `packages/shared/src/moderation.test.ts` |
| Audit trail | `listAuditTrail tracks all state changes` | `packages/shared/src/moderation.test.ts` |
| Contract-shaped enqueue | `enqueues a subject matching the ModerationReviewRequestedEvent contract shape` | `services/moderation-worker/src/phase8.test.ts` |
| State machine via API | `applies policy actions following the contract-defined state machine` | `services/moderation-worker/src/phase8.test.ts` |
| Audit accumulation | `accumulates audit trail entries for each policy action` | `services/moderation-worker/src/phase8.test.ts` |

### P7.2 – Privacy / geo redaction

| Requirement | Test | File |
|---|---|---|
| Minimum geo precision | `enforceMinimumGeoPrecisionKm enforces 1km floor` | `packages/shared/src/privacy.test.ts` |
| Redact DID/URI in text | `redactSensitiveText replaces DIDs and AT URIs` | `packages/shared/src/privacy.test.ts` |
| Redact structured log | `redactLogData recursively redacts structured payloads` | `packages/shared/src/privacy.test.ts` |
| Log retention constant | `log retention constant matches the documented 7-day policy` | `services/moderation-worker/src/phase8.test.ts` |
| Phase 8 log redaction | `redacts DID and URI fields from phase 8 log payload` | `services/api/src/phase8.test.ts` |
| Query geo precision ≥ 1 km | `query map results never expose sub-1km geo precision` | `services/api/src/phase8.test.ts` |
| Moderation log redaction | `redacts DID and URI fields from moderation log payloads` | `services/moderation-worker/src/phase8.test.ts` |

### P7.3 – Anti-spam

| Requirement | Test | File |
|---|---|---|
| Duplicate chat blocked + signal | `blocks repeated duplicate chat payloads and emits suspicious pattern signal` | `services/api/src/phase7.test.ts` |
| DUPLICATE_BLOCKED response code | `reports duplicate-block response code once threshold exceeded` | `services/api/src/phase7.test.ts` |

### P8.1 – Service contracts (this issue)

| Requirement | Test | File |
|---|---|---|
| CONTRACT_VERSION format | `CONTRACT_VERSION is a semver-prefixed phase identifier` | `packages/shared/src/contracts.test.ts` |
| API request/response stubs | `serviceContractStubs.api satisfies ApiQueryAidRequest/Response shapes` | `packages/shared/src/contracts.test.ts` |
| Chat initiation stubs | `serviceContractStubs.api chat initiation satisfies shapes` | `packages/shared/src/contracts.test.ts` |
| Indexer event stub | `serviceContractStubs.indexer event satisfies FirehoseNormalizedEvent shape` | `packages/shared/src/contracts.test.ts` |
| Moderation event stub | `serviceContractStubs.moderationWorker event satisfies ModerationReviewRequestedEvent shape` | `packages/shared/src/contracts.test.ts` |
| ServiceEvent union discrimination | `ServiceEvent union discriminates correctly on the type field` | `packages/shared/src/contracts.test.ts` |
| Phase 8 fixture type compliance | `phase 8 fixture stubs satisfy ApiQueryAidRequest and ApiChatInitiationRequest shapes` | `packages/shared/src/contracts.test.ts` |

---

## Fixture Index

The following deterministic fixture exports are available from `@patchwork/shared` for use across all test suites:

| Export | Domain | Description |
|---|---|---|
| `PHASE8_NOW_ISO` | All | Fixed "now" timestamp anchor |
| `PHASE8_EPOCH_ISO` | All | Fixed epoch baseline |
| `PHASE8_VALID_AID_POST` | Schema (P2.1) | Valid aid post record |
| `PHASE8_VALID_VOLUNTEER_PROFILE` | Schema (P2.1) | Valid volunteer profile record |
| `PHASE8_VALID_CONVERSATION_META` | Schema (P2.1) | Valid conversation meta record |
| `PHASE8_VALID_MODERATION_REPORT` | Schema (P2.1) | Valid moderation report record |
| `PHASE8_VALID_DIRECTORY_RESOURCE` | Schema (P2.1) | Valid directory resource record |
| `buildPhase8FixtureFirehoseEvents()` | Ingestion (P3.1) | 3-event deterministic firehose stream |
| `PHASE8_RANKING_CARDS` | Ranking (P3.4) | Cards with known ordering at `PHASE8_NOW_ISO` |
| `PHASE8_PRIVACY_LOG_PAYLOAD` | Privacy (P7.2) | Unredacted log payload for redaction tests |
| `PHASE8_CHAT_REQUEST` | Routing (P5) | Deterministic chat initiation request |
| `PHASE8_MAP_QUERY_REQUEST` | Routing / API | Deterministic map query request |
| `PHASE8_FIREHOSE_EVENT` | Contracts (P8.1) | Contract-shaped `FirehoseNormalizedEvent` |
| `PHASE8_MODERATION_EVENT` | Contracts (P8.1) | Contract-shaped `ModerationReviewRequestedEvent` |

---

## Running the Phase 8 Test Suite

```sh
# Run all workspaces
npm run test:phase8

# Run per workspace
npm run test:phase8 -w @patchwork/shared
npm run test:phase8 -w @patchwork/api
npm run test:phase8 -w @patchwork/indexer
npm run test:phase8 -w @patchwork/moderation-worker
```

All tests are deterministic and require no external services or environment variables.

---

## Wave 2 — Issue-to-Test Mapping

| Issue | Title | Test files |
|---|---|---|
| #98 | Runtime startup guards | `packages/shared/src/config.test.ts` |
| #103 | Rate limiting + CORS | `services/api/src/rate-limiter.test.ts` · `services/api/src/cors.test.ts` |
| #104 | SLI metrics | `packages/shared/src/alerting.test.ts` |
| #112 | Moderation console + SOPs | `services/api/src/lifecycle-service.test.ts` |
| #118 | Unified inbox | `services/api/src/inbox-service.test.ts` |
| #129 | Offline sync | `packages/shared/src/offline-sync.test.ts` |
| #130 | Feedback + reporting | `services/api/src/feedback-service.test.ts` |

---

## Wave 3 (#99) — E2E Contract-Path Tests

### Detailed Mapping

| Requirement | Test | File |
|---|---|---|
| Full lifecycle happy path (open -> archived) | `walks open -> triaged -> assigned -> in_progress -> resolved -> archived` | `apps/web/e2e/request-lifecycle.test.ts` |
| Transition status pairs | `each transition produces correct previous and current status` | `apps/web/e2e/request-lifecycle.test.ts` |
| Assignment + accept + handoff | `assigns, accepts, and completes handoff with metadata` | `apps/web/e2e/request-lifecycle.test.ts` |
| Lifecycle query reflects metadata | `lifecycle query reflects assignment and handoff metadata` | `apps/web/e2e/request-lifecycle.test.ts` |
| Post-handoff feedback loop | `submits feedback after handoff and retrieves summary` | `apps/web/e2e/request-lifecycle.test.ts` |
| Transition guard — invalid skip | `rejects skip from open to in_progress` | `apps/web/e2e/request-lifecycle.test.ts` |
| Transition guard — role check | `rejects requester trying to triage` | `apps/web/e2e/request-lifecycle.test.ts` |
| Transition guard — archived terminal | `rejects all transitions out of archived` | `apps/web/e2e/request-lifecycle.test.ts` |
| Decline + reassignment | `decline reverts to triaged and allows reassignment` | `apps/web/e2e/request-lifecycle.test.ts` |
| Route-level a11y (per route) | `<route> page has main landmark and skip-link target` | `apps/web/e2e/accessibility.spec.ts` |
| Image alt attributes (per route) | `<route> page has no missing alt attributes on images` | `apps/web/e2e/accessibility.spec.ts` |
| Keyboard tab order | `tab order on home page reaches main interactive elements` | `apps/web/e2e/accessibility.spec.ts` |
| Escape key overlay dismiss | `Escape key dismisses any visible overlay on map route` | `apps/web/e2e/accessibility.spec.ts` |

### E2E Test Matrix

| Scenario | Lifecycle | Assignment | Feedback | a11y | CI job |
|---|---|---|---|---|---|
| Happy path: open -> archived | Y | Y | Y | — | `e2e-production` |
| Transition guards (invalid paths) | Y | — | — | — | `e2e-production` |
| Decline + reassignment | Y | Y | — | — | `e2e-production` |
| Route a11y validation (7 routes) | — | — | — | Y | `quality-gates` |
| Keyboard navigation | — | — | — | Y | `quality-gates` |

### Running Production-Like Tests Locally

```sh
# 1. Start Postgres via docker-compose
npm run db:up

# 2. Run database migrations
npm run db:migrate

# 3. Run the E2E contract-path lifecycle tests
npm run test:e2e:contract -w @patchwork/web

# 4. Run the Phase 8.2 E2E tests (firehose + discovery + chat)
npm run test:phase8-e2e

# 5. Run the Playwright accessibility + browser E2E tests
npx playwright install --with-deps chromium
npm run test:e2e -w @patchwork/web

# 6. Tear down Postgres
npm run db:down
```

To simulate the full CI production-like environment:

```sh
export NODE_ENV=production
export API_DATA_SOURCE=postgres
export API_DATABASE_URL=postgresql://patchwork:patchwork@localhost:5432/patchwork
npm run db:up && npm run db:migrate
npm run test:e2e:contract -w @patchwork/web
npm run test:phase8-e2e
```
