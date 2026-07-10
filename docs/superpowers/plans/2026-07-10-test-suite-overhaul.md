# Test Suite Overhaul Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. For complex multi-agent splits, use
> `parallel-feature-development`, `team-composition-patterns`, and
> `team-communication-protocols`. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Make Patchwork's test matrix accurately measure production-path confidence, execute every required layer in CI, and report results by test type instead of one misleading aggregate count.

**Architecture:** Keep fast domain and fixture suites, but explicitly separate them from PostgreSQL integration, HTTP process integration, browser E2E, and live external evidence. CI will run each layer with its required dependencies and publish non-blocking coverage artifacts. Redundant phase aliases will become named compatibility suites rather than duplicate mandatory gates.

**Tech Stack:** Vitest 3, Playwright 1.58, PostgreSQL 16, Node.js 22, GitHub Actions, V8 coverage.

---

### Task 1: Make PostgreSQL integration mandatory in CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `services/api/package.json`

- [x] Add `test:integration:postgres` that runs both PostgreSQL-backed API test files.
- [x] Set `TEST_DATABASE_URL` in the PostgreSQL CI job.
- [x] Run the integration command after migrations and verify no tests are skipped.
- [x] Commit as `ci(test): require PostgreSQL integration tests`.

### Task 2: Add a real HTTP/PostgreSQL lifecycle test

**Files:**
- Create: `services/api/src/http-lifecycle.postgres.test.ts`
- Modify: `services/api/src/index.ts`
- Move: `apps/web/e2e/request-lifecycle.test.ts` to `services/api/src/lifecycle-service.integration.test.ts`
- Modify: `apps/web/vitest.e2e.config.ts`
- Modify: `apps/web/package.json`

- [x] Export a testable lifecycle HTTP handler whose dependencies are injected without importing production startup side effects.
- [x] Start the HTTP server on an ephemeral port against migrated PostgreSQL.
- [x] Exercise authenticated lifecycle registration, transition, retry, forbidden ownership, and restart/readback through HTTP.
- [x] Rename the direct-service lifecycle suite and its command so it is not described as E2E.
- [x] Commit as `test(api): add real HTTP PostgreSQL lifecycle coverage`.

### Task 3: Add diagnostic coverage reporting

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.coverage.config.ts`
- Modify: `.github/workflows/ci.yml`

- [x] Install `@vitest/coverage-v8` matching the upgraded Vitest 4.1.10 test runner.
- [x] Add `test:coverage` with text, JSON summary, and LCOV output.
- [x] Exclude generated files, fixtures, migrations, and test files from coverage.
- [x] Upload coverage as a CI artifact without introducing an arbitrary global threshold.
- [x] Commit as `test: add diagnostic V8 coverage reporting`.

### Task 4: Replace the legacy traceability map with layered evidence

**Files:**
- Rewrite: `docs/test-traceability.md`
- Modify: `docs/operations/evidence/quality-review.md`

- [x] Classify every suite as domain unit, fixture service, database integration, HTTP integration, browser E2E, or external protocol evidence.
- [x] Map current AT OAuth, record, durability, block/report, lifecycle, and ingestion behavior.
- [x] State which layers run locally and in each CI job.
- [x] Replace aggregate-count readiness claims with per-layer results.
- [x] Commit as `docs(test): rebuild layered traceability map`.

### Task 5: Consolidate duplicate mandatory gates and verify the overhaul

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/operations/evidence/quality-review.md`

- [ ] Remove duplicate Phase 7/8 runs from the mandatory job when the same files already run under the unit suite.
- [ ] Keep compatibility commands available for targeted local diagnosis.
- [ ] Run lint, typecheck, unit/fixture, PostgreSQL integration, service integration, browser E2E, and coverage.
- [ ] Record exact per-layer results and remaining external/manual gaps.
- [ ] Commit as `test: complete layered test suite overhaul`.
