# Phase 6 production data-mode evidence

Date: 2026-07-11

Task 6.2 removes the web client's implicit production fixture path. This
evidence covers the local implementation boundary only; it does not claim the
real two-account browser journey required by the Phase 6 exit gate.

## Runtime boundary

- The default web data mode is `api`.
- Production and default builds initialize aid-post and directory state empty
  and query the configured API. Failed reads retain the current state and show
  a typed `network`, `authentication`, `validation`, `conflict`, or `server`
  error with a stable code.
- Map, feed, and resource-directory retry controls repeat only idempotent GET
  requests. Successful mutations are not automatically repeated.
- Expansion routes deferred from the narrow alpha show a scope notice rather
  than mounting process-local simulated workflows.
- Local demo records load only through the fixture module when a development
  build explicitly sets `VITE_DATA_MODE=fixture`.

## Build assertions

The normal production build passed. Artifact searches confirmed that no
`did:example:` identity and none of these fixture sentinels were present in
`apps/web/dist`:

- `Need groceries before 21:00`
- `Sunrise Food Bank`
- `did:example:resident-1`

An explicit local demo build using
`VITE_DATA_MODE=fixture npm run build -w @patchwork/web -- --mode development`
contained both demo record families. The production command
`VITE_DATA_MODE=fixture npm run build -w @patchwork/web` failed before bundling
with `VITE_DATA_MODE=fixture is forbidden in production builds.`

## Verification

- Database-enabled full repository gate: 825 passed.
- Focused web tests: data-mode and API client, 10 passed.
- PostgreSQL/HTTP integration: 23 passed.
- Direct lifecycle service integration: 9 passed.
- Chromium browser suite: 36 passed, including a real browser assertion that
  an unavailable API remains visible, never substitutes demo records, and a
  retry issues a second GET.
- Diagnostic coverage: 58.75% statements, 46.64% branches, 52.00% functions,
  and 59.96% lines.
- Full workspace build: passed.
- Migration replay: API 11 skipped, indexer 3 skipped, moderation 2 skipped
  after clean application.
- Dependency audit at the high-severity gate: passed. One low-severity,
  Windows-only esbuild development-server advisory remains recorded and does
  not affect the production artifact.

## Phase 6 follow-through

Task 6.3 and the Phase 6 exit gate were completed on 2026-07-28 with two real
browser sessions, PostgreSQL-backed services, disposable PDS accounts, OAuth,
create/discover/workflow/report/block/close/delete behavior, and fixture mode
disabled. See `alpha-browser-journey-local.md`.
