# Phase 6 alpha browser journey: local evidence

Date: 2026-07-11

This evidence records the locally feasible Task 6.3 implementation. It does
not claim the Phase 6 exit gate, because the real two-account test has not yet
run against an authorized staging URL and disposable OAuth/PDS accounts.

## Production paths completed

- Aid-post creation sends only the validated AT record. Browser-supplied author
  values are neither accepted nor serialized; the returned repository URI is
  the source of the owner DID.
- Durable projections carry the current PDS CID through discovery to the
  browser record envelope.
- Owner close and delete controls use the authenticated AT command endpoints
  with the current CID. Close retains the replacement CID and delete uses that
  replacement, proving compare-and-swap sequencing.
- Report and block controls collect bounded private input, send CSRF-protected
  idempotent commands, and never serialize reporter/blocker/actor identity.
- Map/feed discovery remains public for anonymous visitors. When the request
  carries a browser session, the API derives the viewer DID and bilaterally
  excludes authors connected by an active durable block. Browser-supplied
  viewer parameters are ignored, and an expired supplied session returns `401`
  rather than silently receiving the anonymous result set.
- The extracted safety HTTP handler authenticates once, derives the durable
  actor, and persists reports and blocks in PostgreSQL. A real HTTP/PostgreSQL
  test proves hostile identity fields cannot override the session DID.
- Browser lifecycle transitions no longer send actor DID or role; presentation
  state uses the actor and role returned by the server.
- Owners load private workflow state through authenticated `GET
  /aid/post/lifecycle`; ordinary cross-account reads receive `403`, and query
  parameters cannot elevate the durable role. The shell derives an initial
  owner workflow from the public record only when no workflow exists yet.
- After a durable transition, the shell calls the production AT status
  reconciliation command with the indexed CID. A committed-private/failed-PDS
  result remains visible and offers an idempotent retry that converges on the
  current PDS CID instead of repeating the lifecycle mutation.
- Local-only urgency and close mutations are unavailable in API mode.

## Browser and privacy evidence

Four rendered-browser cases cover report, block, owner close-to-delete, and
private-lifecycle/public-AT synchronization recovery.
They verify CSRF delivery, identity omission, private confirmation, CID
replacement, and removal after deletion. The external
`at-record-lifecycle.spec.ts` now includes the workflow transition in the same
two-account sequence and asserts
that exact input coordinates, private report details, and OAuth token names do
not appear in URLs, rendered DOM, or captured JSON responses.

Playwright now retains traces and screenshots only for failures. The repository
redaction gate refuses any artifact set unless the controlled run supplies the
exact sensitive values to scan, and fails if those values occur in ordinary or
compressed trace content.

## Verification

- Database-enabled full repository gate: 873 passed.
- PostgreSQL/HTTP integration: 32 passed.
- Direct lifecycle service integration: 9 passed.
- Chromium: 49 passed; the single real-environment journey skipped because its
  required external inputs were absent.
- Diagnostic coverage: 65.38% statements, 51.91% branches, 59.29% functions,
  66.54% lines.
- Full workspace build and high-severity dependency audit: passed. One known
  low-severity Windows development-server advisory remains.
- Clean migration application and replay: API 13, indexer 3, moderation 3.
- Production artifact search: no demo identities or records.

## Exact external blocker and execution contract

The remaining proof requires these operator-authorized inputs:

- `PATCHWORK_E2E_BASE_URL`: staging web origin with API, indexer, PostgreSQL,
  and PDS connectivity healthy;
- `PATCHWORK_E2E_REQUESTER_STATE`: Playwright storage state produced by a real
  requester OAuth callback;
- `PATCHWORK_E2E_HELPER_STATE`: storage state for a second disposable account;
- `PATCHWORK_E2E_EXACT_LATITUDE` and `PATCHWORK_E2E_EXACT_LONGITUDE`: disposable
  high-precision inputs whose exact strings must not escape privacy boundaries.
- `PATCHWORK_E2E_PRIVATE_MARKER`: disposable private report text used only to
  prove response/DOM redaction.
- `PATCHWORK_ARTIFACT_REDACTION_TERMS`: comma-separated exact coordinates,
  private marker, and disposable token values checked before artifact upload.

Run `npm run test:e2e -w @patchwork/web -- e2e/at-record-lifecycle.spec.ts`
only in that controlled environment. Successful execution must be accompanied
by redacted PDS CRUD, ingestion, projection, tombstone, and deletion evidence.
