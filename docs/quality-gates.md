# Quality gates (Phase 7)

The repository quality baseline is enforced through workspace scripts and CI, with explicit moderation/privacy regression gates for Phase 7.

## Local commands

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:phase7`
- `npm run build`

`npm run check` remains the default combined local gate (`lint + typecheck + test`).

`npm run test:phase7` is a focused regression suite that must stay green for moderation and privacy hardening:

- moderation queue and policy transitions
- anti-spam duplicate/rate-limit/suspicious-signal behavior
- geoprivacy precision + sensitive-field log redaction

## CI behavior

Workflow: `.github/workflows/ci.yml`

Runs on pull requests and pushes to `main`:

1. Install dependencies (`npm ci`)
2. Lint
3. Typecheck
4. Moderation + privacy regression gate (`npm run test:phase7`)
5. Unit tests
6. API/contract E2E request-to-handoff flow (`npm run test:phase8-e2e`)
7. Install Playwright browsers (`npx playwright install --with-deps chromium` in `apps/web`)
8. Browser E2E tests (`npm run test:e2e -w @patchwork/web`)
9. Build

If any step fails, the workflow fails and merge should be blocked via branch protection using this workflow check as required.

## Logging privacy + retention assumptions

Phase 7 introduces redaction utilities and minimal event-log behavior for ingestion/moderation-adjacent diagnostics.

- Sensitive identifiers (DIDs, AT URIs) are redacted in public diagnostics/log views.
- Exact geo coordinates are not emitted in query APIs or public map markers.
- In-memory moderation/ingestion diagnostic logs assume a short retention window (default documented assumption: 7 days).

If retention policies change in deployment environments, this document and relevant tests should be updated in the same PR.
