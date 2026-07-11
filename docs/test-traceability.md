# Patchwork layered test traceability

Updated: 2026-07-10

This document describes what each test layer actually executes. Test counts are reported by layer because fixture-heavy unit coverage is not equivalent to PostgreSQL, HTTP, browser, or live AT Protocol evidence.

## Test layers

| Layer | Purpose | Command | External dependency | CI location |
| --- | --- | --- | --- | --- |
| Domain/unit | Pure rules, validators, state machines, presentation helpers | `npm test` | None | `quality-gates` |
| Fixture service integration | Multiple in-process services using deterministic fixtures | `npm run test:integration:service -w @patchwork/web` | None | `e2e-production` |
| PostgreSQL integration | Migrations, persistence, restart, rollback, idempotency | `npm run test:integration:postgres -w @patchwork/api` | PostgreSQL 16 and `TEST_DATABASE_URL` | `e2e-production` |
| HTTP/PostgreSQL integration | Real Node HTTP server, cookies, JSON boundary, durable lifecycle state | Included in API PostgreSQL integration | PostgreSQL 16 | `e2e-production` |
| Browser E2E | Rendered web application, focus, keyboard, landmarks, ARIA | `npm run test:e2e -w @patchwork/web` | Playwright Chromium | `quality-gates` |
| Diagnostic coverage | Finds unexecuted production code; no arbitrary global threshold | `npm run test:coverage` | None | `quality-gates`, uploaded artifact |
| External AT protocol | Disposable accounts against the staging PDS | Manual controlled exercise | Home-network staging PDS | Redacted evidence only |

## Current verified baseline

| Layer | Result |
| --- | --- |
| Core alpha unit/fixture suite | 754 passed; 9 database cases skipped in this layer |
| Direct lifecycle service integration | 9 passed |
| PostgreSQL integration, including HTTP boundary | 11 passed |
| Browser Chromium accessibility | 33 passed |
| Coverage after expansion-test pruning | 63.63% statements, 49.08% branches, 55.17% functions, 64.65% lines |
| External AT protocol | Two-account create/read/update/close/delete and ownership denial verified manually |

Counts can change as tests are consolidated. Readiness depends on covered boundaries, not the aggregate.

## Critical behavior matrix

| Capability | Domain/unit | Fixture service | PostgreSQL | HTTP | Browser | External AT | Remaining gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AT OAuth adapter | `packages/at-client/src/oauth-client.test.ts` | — | OAuth state/session restart tests | Auth route unit/service tests | Auth UX models only | OAuth metadata verified; browser callback not yet demonstrated | Real browser OAuth callback |
| Aid-post repository CRUD | Lexicon and record-client tests | Command service tests | Session persistence only | Command route tests | Posting form and API-client tests | Two-account lifecycle evidence | Automated disposable-PDS job |
| AT wire encoding | Integer coordinate adapter tests | — | — | — | — | Live staging PDS accepted records | Other custom record families |
| Lifecycle rules | `packages/shared/src/lifecycle.test.ts` | `lifecycle-service.integration.test.ts` | Restart, retry, rollback, audit, assignment/handoff, deletion, role, and public-sync state | `lifecycle-transition-handler.postgres.test.ts` | Lifecycle UI is fixture-oriented | Author status reconciliation is command-tested; live stream reconciliation is absent | Concurrent-command proof and automatic stream reconciliation |
| Blocks and reports | Service validation tests | Older chat safety fixtures | Repository retention/deletion tests | Authenticated route wiring lacks full HTTP test | Chat safety UX fixtures | — | Cross-request enforcement |
| Discovery | Firehose, ranking, discovery rule tests | Phase fixture pipeline | Discovery events persist | Query service tests do not use live ingestion | Map/feed UI and accessibility | — | Live stream to projection database |
| Moderation | Policy and queue state tests | Worker fixture services | Concurrent PostgreSQL queue claim using `SKIP LOCKED`; runtime still fixture-backed | — | Console UX fixtures | — | Lease completion/retry, audit store, runtime wiring, and crash recovery |
| Privacy | Geo floor and redaction tests | Fixture response checks | Audit payload redaction | HTTP boundary avoids actor override | Accessibility only | Redacted lifecycle evidence | Retention enforcement jobs |

## Suite ownership and classification

### Domain and unit suites

- `packages/shared/src/*.test.ts`: retained alpha domain rules and deterministic models.
- `packages/at-lexicons/src/lexicons.test.ts`: local JSON lexicon loading and validation.
- `packages/at-client/src/*.test.ts`: official AT SDK adapter behavior and stable error mapping.
- `apps/web/src/*.test.ts(x)`: UX models, API client parsing, accessibility helpers, and component rendering.
- `apps/mobile`: contract-only source is typechecked; its prototype tests were removed from the alpha gate.
- `services/*/src/*.test.ts`: service behavior, including many fixture-backed models.

### Direct service integration

`apps/web/e2e/lifecycle-service.integration.test.ts` imports API service factories directly. It verifies cross-service lifecycle and feedback behavior, but deliberately does not claim HTTP, authentication, process, or database coverage.

### PostgreSQL and HTTP integration

The mandatory API integration command runs:

- `services/api/src/auth/session-repository.postgres.test.ts`
- `services/api/src/db/core-operational-state.test.ts`
- `services/api/src/http/lifecycle-transition-handler.postgres.test.ts`

These tests require `TEST_DATABASE_URL`. They verify encrypted OAuth persistence, browser-session revocation, migrations, restart survival, command idempotency, transaction rollback, audit redaction, subject deletion, HTTP parsing, session-derived identity, ownership denial, and server restart/readback.

### Browser E2E

`apps/web/e2e/accessibility.spec.ts` starts the Vite web application and runs in Chromium. It verifies skip links, landmarks, keyboard operation, Escape behavior, labels, ARIA semantics, focus management, route announcements, and image alternatives.

### External protocol evidence

`docs/operations/evidence/phase-2/at-record-lifecycle.md` records the disposable two-account staging-PDS exercise. Tokens and passwords are intentionally absent. This evidence is valuable but manual and must not be counted as an automated test.

## Coverage interpretation

Coverage is diagnostic. The post-pruning drop is intentional: it exposes how much unshipped expansion source remains without alpha release protection. Retained gaps at important runtime boundaries include:

- `apps/web/src/features/frontend-shell.tsx`
- `services/api/src/http/lifecycle-transition-handler.ts` in the no-database coverage job
- PostgreSQL block/report/audit repositories outside the database job
- indexer checkpoint and metrics runtime paths

CI uploads `coverage/coverage-summary.json`, LCOV, and the HTML-compatible data needed by coverage tools. No global threshold is enforced until fixture-heavy code and production runtime code are separated into meaningful targets.

## Deferred expansion code

Tests for contract-only or fixture-only expansion systems were removed from the active repository on 2026-07-10. Their TypeScript remains subject to lint, typecheck, and build. A deferred feature must receive tests at the appropriate persistence and external boundary when it is selected for implementation; the old fixture corpus should not be restored wholesale.

## Local full-matrix procedure

```sh
npm run lint
npm run typecheck
npm test

# With disposable PostgreSQL and TEST_DATABASE_URL configured:
npm run db:migrate -w @patchwork/api
npm run test:integration:postgres -w @patchwork/api
TEST_DATABASE_URL=postgresql://... npm test -w @patchwork/moderation-worker

npm run test:integration:service -w @patchwork/web
npx playwright install chromium
npm run test:e2e -w @patchwork/web
npm run test:coverage
npm audit --audit-level=high
```

The external staging-PDS exercise is intentionally separate from this routine and requires controlled disposable credentials.
