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
| Database-enabled full repository suite | 836 passed |
| Direct lifecycle service integration | 9 passed |
| PostgreSQL integration, including HTTP boundary | 24 passed |
| Browser Chromium suite | 39 passed, 1 externally gated case skipped |
| Diagnostic coverage without database suites | 58.22% statements, 45.95% branches, 51.44% functions, 59.44% lines |
| External AT protocol | Two-account create/read/update/close/delete and ownership denial verified manually |

Counts can change as tests are consolidated. Readiness depends on covered boundaries, not the aggregate.

## Critical behavior matrix

| Capability | Domain/unit | Fixture service | PostgreSQL | HTTP | Browser | External AT | Remaining gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AT OAuth adapter | OAuth adapter plus stable denied/state-error mapping | Cookie-only AuthProvider and API client | OAuth state/session restart tests | Login JSON/redirect, sanitized callback, session/refresh/logout routes | Login/callback recovery, keyboard, labels, live regions | OAuth metadata verified; browser callback not yet demonstrated | Real browser OAuth callback |
| Aid-post repository CRUD | Lexicon and record-client tests | Command service tests | Session persistence only | Command route tests | Posting form and API-client tests | Two-account lifecycle evidence | Automated disposable-PDS job |
| AT wire encoding | Integer coordinate adapter tests | — | — | — | — | Live staging PDS accepted records | Other custom record families |
| Lifecycle rules | `packages/shared/src/lifecycle.test.ts` | `lifecycle-service.integration.test.ts` | Restart, retry, rollback, audit, assignment/handoff, deletion, role, and public-sync state | `lifecycle-transition-handler.postgres.test.ts` | Lifecycle UI is fixture-oriented | Author status reconciliation is command-tested; live stream reconciliation is absent | Concurrent-command proof and automatic stream reconciliation |
| Blocks and reports | Service and typed client validation | Older chat safety fixtures are unavailable in production | Repository retention/deletion and idempotency tests | Authenticated session-derived report/block actors persist through real HTTP | Rendered report details, confirmation, CSRF, success/error behavior | Real journey harness awaits two OAuth states | Cross-request enforcement and external execution |
| Discovery | Firehose, ranking, discovery rule, data-mode, and typed API failure tests | Local demo fixtures require explicit fixture mode | Cursor, heartbeat, normalized aid-post projections, tombstones, and dead letters persist | Real PostgreSQL projection filters, pagination, freshness, and startup lag rejection | Map/feed UI, accessibility, API-unavailable visibility, and idempotent retry with no fixture substitution | Local Jetstream-compatible WebSocket integration | Controlled live AT lifecycle exercise |
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

### API transport security

`services/api/src/http/router.test.ts` verifies method/path resolution and the
known-path versus unknown-path distinction. `api-server-routing.test.ts` opens a
real loopback HTTP server and proves that an unsupported method returns `405`,
an exact `Allow` header, and the public error envelope. Later Phase 4 slices add
authenticated-principal, body-parser, CSRF, perimeter, and shutdown coverage.
The same server suite now covers malformed JSON, unsupported media type, and
one-mebibyte rejection; `error-response.test.ts` proves unknown exception text
is replaced rather than serialized.
`authenticated-request.test.ts` covers bearer and cookie parsing, missing and
conflicting credentials, single session/role resolution, and deep immutability.
The lifecycle PostgreSQL HTTP suite covers missing and expired sessions plus
authorization derived from the durable role instead of hostile body fields.
`graceful-shutdown.test.ts` uses a real Node server to prove immediate refusal
of new connections, active-request drain, pool-close ordering, and idempotency.
`perimeter.test.ts` verifies restrictive security headers, production HSTS,
double-submit CSRF validation, constant-origin policy, and Secure/Strict CSRF
cookie attributes. The live server suite proves middleware rejection and header
emission on an actual HTTP response.
`rate-limiter.test.ts` proves policy selection and exhaustion/reset behavior,
plus exact-IP/subnet proxy trust and spoofed forwarded-header rejection.
`cors.test.ts` proves rejected origins receive neither wildcard nor credential
permission and accepted origins receive explicit credential permission.
`query-string-security.test.ts` scans the API and moderation runtime entrypoints
and fails if fixture `FromParams` routes, moderation URL-body parsing, or
sensitive query keys return. Worker live HTTP coverage proves the former query
mutation is now `405` and the JSON route refuses fixture persistence.
`moderation-gateway.test.ts` proves the API forwards its service credential and
session-derived actor while stripping hostile actor fields. Worker live HTTP
coverage proves credential rejection; its PostgreSQL branch proves the durable
audit actor came from the authenticated gateway header.
`idempotency-store.postgres.test.ts` proves concurrent execute-once behavior,
durable response replay after reconstruction, canonical payload matching, and
conflicting-key rejection against PostgreSQL.
`idempotent-request.test.ts` proves header validation and hostile body-command
replacement. The lifecycle PostgreSQL HTTP restart test exercises the wired
ledger, `record-client.test.ts` proves deterministic PDS create uses the same
record key, and the web API-client test asserts mutation header generation.

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

The Phase 5 source slice adds `jetstream-source.test.ts` and `runtime.test.ts`.
They use a real loopback WebSocket server to prove collection filters, durable
cursor resume, reconnect/redelivery after processing failure, duplicate and
out-of-order suppression, malformed and oversized rejection, shutdown without
reconnect, and final checkpoint persistence. These tests deliberately do not
claim durable projections or a public Jetstream exercise.

`db/projection-store.test.ts` adds PostgreSQL coverage for empty migration and
replay, privacy-safe create, update, stale and duplicate suppression, delete
tombstones, invalid-record quarantine, pipeline-before-checkpoint ordering,
rebuild equivalence, and database-outage redelivery. The diagnostic coverage
command omits database suites; the database-enabled full gate runs workspace
tests serially where required.

`query-service.postgres.test.ts` now uses PostgreSQL rather than mocking the
legacy event loader. It proves the API reads projection rows, filters by every
alpha discovery dimension, returns stable pages, and includes durable
freshness metadata. `query-service-readiness.test.ts` covers unavailable,
stale, and threshold-edge heartbeat policy. A startup acceptance command also
proved a current heartbeat initializes successfully and a one-hour-old
heartbeat fails the API's 300-second guard.

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
