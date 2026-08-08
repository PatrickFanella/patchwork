# Quality gates

The repository quality baseline is organized around the current alpha rather than historical phase-number suites.

## Local commands

- `npm run check` — lint, typecheck, the 1,034-test local core suite, map and exact-location checks, and operational traceability checks
- `npm run test:integration:postgres -w @patchwork/api` — PostgreSQL and HTTP boundaries
- `npm run test:integration:service -w @patchwork/web` — direct lifecycle service integration
- `npm run test:e2e -w @patchwork/web` — Chromium browser behavior and accessibility; protected non-mocked staging cases require credentials and are reported separately
- `npm run test:coverage` — diagnostic V8 coverage
- `npm run build`

The core suite retains moderation, privacy, authorization, lifecycle, AT, discovery, and safety behavior. Expansion-prototype suites were removed on 2026-07-10; their source remains typechecked but is not a release gate.

## CI behavior

Workflow: `.github/workflows/ci.yml`

The quality job runs lint, typecheck, core tests, diagnostic coverage, Chromium E2E, dependency audit, secret scanning, builds, and container scans. The PostgreSQL job applies migrations and runs mandatory PostgreSQL/HTTP plus direct-service integration tests.

If any distinct layer fails, the workflow fails. Historical Phase 7/8 commands were removed because they duplicated files already in the old aggregate suite.

## Logging privacy and retention assumptions

- Sensitive identifiers are redacted from public diagnostics and audit payloads.
- Exact geographic coordinates are not emitted in public map records.
- Private operational rows carry retention metadata; enforcement jobs remain continuation work.
- In-memory moderation/ingestion diagnostic logs retain the documented short-window assumption until durable stores replace them.
