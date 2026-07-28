# Phase 6 alpha browser journey: local evidence

Date: 2026-07-28

This evidence records the completed Task 6.3 implementation and controlled
home-network execution. The Phase 6 exit gate is satisfied by two disposable
OAuth/PDS accounts against the NUC-hosted PostgreSQL, API, local Jetstream,
indexer, moderation worker, and production web build.

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

The first controlled run supplied the previously absent external inputs and
failed after publish: PostgreSQL already held the projection, but repeated
two-session restoration exhausted the auth limiter's shared 10-request IP
budget. A focused unit test reproduced the perimeter classification error.
`GET /auth/session` now uses the ordinary read budget while login, callback,
refresh, signup, and other authentication operations retain the stricter
budget. The next run showed that navigation polling was aborting each discovery
request before React could render it; the harness now waits for network idle
between bounded retries. The unchanged production discovery response then
rendered immediately.

The final journey passed in 12.2 seconds and covered:

- two independent cookie-only OAuth browser sessions;
- authenticated PDS creation with no browser-supplied author identity;
- local Jetstream ingestion and PostgreSQL projection discovery by the helper;
- a private report and durable block derived from the helper session;
- owner-only lifecycle resolve, public AT close reconciliation, and CID-aware
  delete;
- disappearance after the live PDS tombstone; and
- exact-coordinate, private-marker, token-name, URL, DOM, and captured-JSON
  privacy assertions.

Playwright now retains traces and screenshots only for failures. The repository
redaction gate refuses any artifact set unless the controlled run supplies the
exact sensitive values to scan, and fails if those values occur in ordinary or
compressed trace content.
The red runs produced blocked artifacts containing controlled form values and
token field names; they were neither uploaded nor retained. The passing run
produced no failure trace or screenshot.

## Verification

- Repository typecheck, lint, unit/contract gate: 891 passed.
- PostgreSQL/HTTP integration: 33 passed.
- Direct lifecycle service integration: 9 passed.
- Chromium local suite: 50 passed with the external journey gated.
- Controlled external Chromium journey: 1 passed in 12.2 seconds.
- Diagnostic coverage: 65.38% statements, 51.91% branches, 59.29% functions,
  66.54% lines.
- Full workspace build and high-severity dependency audit: passed. One known
  low-severity Windows development-server advisory remains.
- Clean migration application and replay: API 13, indexer 4, moderation 3.
- Production artifact search: no demo identities or records.

## Controlled execution contract

The successful run supplied these operator-controlled inputs:

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
only in a controlled environment. Each execution must use disposable accounts,
run the artifact redaction gate before any upload, verify projection/tombstone
state, deactivate Patchwork-held account data, and delete the PDS accounts.

Post-run aggregate verification showed zero disposable projections, browser
sessions, OAuth sessions, or workflows; two deactivation receipts remained,
and the one retained safety report had its private details cleared and deletion
timestamp set according to policy.
