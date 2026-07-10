# Patchwork test quality review

Reviewed: 2026-07-10

## Summary

- Verdict: **With fixes**
- Scope: the complete local test matrix at commit `afe05e9`, plus test-suite structure, CI wiring, and traceability documentation.
- Result after repairing one test-harness defect: **1,994 Vitest tests, 9 contract-path tests, and 33 Chromium tests passed**.
- Inventory: 116 test/spec files containing about 29,854 lines, compared with about 45,317 lines of non-test TypeScript/TSX.

## Triage

- Docs-only: no
- React/Next performance review: no
- UI guidelines audit: no
- Reason: this was a test-system review. The only code change is inside a Playwright accessibility test; no application UI or runtime behavior changed.

## Matrix executed

| Layer | Result | Notes |
| --- | --- | --- |
| Workspace Vitest suite with PostgreSQL enabled | 1,994 passed, 0 skipped | Included OAuth persistence and core operational-state integration tests. |
| Contract-path Vitest suite | 9 passed | Imports API service factories directly; it does not exercise HTTP, process startup, or PostgreSQL. |
| Playwright Chromium accessibility suite | 33 passed | Initial run was blocked by a missing browser binary; after installing the declared browser, one Node/page-context test defect was found and repaired. |
| Coverage instrumentation | Not available | No `@vitest/coverage-v8` dependency, coverage script, thresholds, or CI coverage artifact exists. |
| Live PDS exercise | Not rerun | The two-account CRUD evidence remains manual and redacted; it is not part of the automated suite. |

## Strengths

- The suite is deterministic and fast for its size.
- Domain rules around lifecycle, authorization, privacy, matching, moderation, and migrations have broad regression coverage.
- Real PostgreSQL tests now cover OAuth/session persistence, restart survival, transaction rollback, idempotency, audit redaction, and subject deletion.
- Browser coverage checks keyboard navigation, landmarks, form labels, focus behavior, ARIA semantics, and route-level image alternatives.
- The test-harness failure was distinct from product behavior and is now fixed in `apps/web/e2e/accessibility.spec.ts`.

## Issues

### Important

1. **PostgreSQL integration tests are silently skipped in CI.**

   The tests use `TEST_DATABASE_URL`, but neither CI job sets that variable. The `e2e-production` job sets `API_DATABASE_URL`, which the integration tests do not read. Consequently, the default CI headline can be green without executing the six database-dependent tests.

   Minimal fix: set `TEST_DATABASE_URL` in the PostgreSQL CI job and run the API integration suite explicitly.

2. **The “production-like E2E” suite is not end to end.**

   `apps/web/e2e/request-lifecycle.test.ts` imports `createLifecycleService()` and `createFeedbackService()` directly. It does not start the API, make HTTP requests, authenticate, or use PostgreSQL. The job’s database service and migration step therefore do not validate the path described by the job and documentation.

   Minimal fix: retain this suite as a service integration test, rename it accordingly, and add a true process/HTTP test against the migrated database.

3. **The traceability map reflects the old fixture architecture.**

   Identity and record CRUD are mapped mainly to `packages/shared` fixture tests. The map omits the official AT client adapter, encrypted OAuth stores, live-PDS evidence, durable lifecycle repositories, block/report services, and the distinction between fixture and production paths.

   Minimal fix: add a “runtime maturity” and “execution layer” column and map the continuation-plan tests separately from legacy phase fixtures.

4. **Raw test count overstates deployed-path confidence.**

   Large phase-oriented suites repeatedly validate the same fixture contracts at shared, API, indexer, and web layers. This is useful regression coverage, but only a small portion crosses a real database, browser, or external AT service boundary.

   Minimal fix: report counts by layer—domain/unit, fixture service, database integration, browser E2E, and external protocol—rather than one aggregate number.

5. **No coverage or mutation signal identifies redundant tests.**

   The repository has no coverage provider or thresholds. A passing test count therefore cannot reveal whether several tests hit the same branches or whether important runtime code is untouched.

   Minimal fix: add V8 coverage initially as a diagnostic artifact, without enforcing a global percentage. Use per-package uncovered-file reports to guide consolidation.

### Minor

- Phase-specific scripts mostly rerun files already included by `npm test`, increasing CI work without clearly reporting incremental coverage.
- The Playwright browser must be installed locally after dependency updates; the CI workflow already handles this correctly.
- Test output includes repeated `NO_COLOR`/`FORCE_COLOR` warnings, which add noise but do not affect results.

## Recommended next test work

1. Make CI execute the PostgreSQL tests instead of skipping them.
2. Reclassify `request-lifecycle.test.ts` as service integration, then add a real HTTP/PostgreSQL lifecycle test.
3. Update `docs/test-traceability.md` for the current architecture and test layers.
4. Add non-blocking V8 coverage reporting.
5. Consolidate redundant phase/fixture tests only after coverage and mutation evidence shows they add no distinct protection.

Roadmap implementation should remain paused until the first three items are addressed or consciously deferred.
