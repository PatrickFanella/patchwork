# Buyer-ready Phase 4 exact-location evidence

Date: 2026-07-28

Scope: Phase 4 of
[`2026-07-28-buyer-ready-web-completion-roadmap.md`](../../superpowers/plans/2026-07-28-buyer-ready-web-completion-roadmap.md).

## Result

Phase 4 is complete at the repository and local browser/runtime boundary.

- Signaling is available only to the two participants of an accepted, active
  connection. Every state read and signal write rechecks connection state,
  account deactivation, bilateral blocks, moderation visibility, and the
  authenticated session.
- Both participants must consent within two minutes. The resulting session is
  single-use, expires within five minutes, has participant-specific random peer
  proofs, and is swept without logging its identifier.
- SDP and ICE relay payloads are strictly coordinate-free and bounded. They
  live only in the API process, have no migration or AT schema, and disappear
  on expiry, revoke, authorization loss, or process restart.
- The requester and helper establish a DTLS-encrypted WebRTC data channel and
  authenticate the peer proof before location sharing becomes active. Exact
  coordinates are accepted only from the browser geolocation API and sent only
  over that live data channel.
- The web exposes explicit consent/waiting, connecting, active, stop/clear,
  expiry, and failure states. Browser state holds at most the most recently
  received coordinate and clears it on stop, navigation, tab hiding, timeout,
  logout/unmount, channel close, or error.
- There is no HTTP coordinate input, persistent fallback, server export,
  notification payload, analytics payload, or backup table for a personal
  exact coordinate.
- Declared maintenance rejects consent, state reads, and signaling. Participant
  revocation remains available so an active client can still clear the
  exchange.

The operational **NO-GO** remains unchanged.

## Verification

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test` | Passed: web 233, API 280 plus 53 environment skips, indexer 35 plus 17 skips, moderation 53 plus 11 skips, AT client 26, lexicons 5, shared 320; map and exact-location absence scripts passed |
| API PostgreSQL integration | 50 passed across 13 files |
| Web direct service integration | 8 passed |
| `npm run build` | Passed |
| Web Chromium E2E | 68 passed; 1 credential-gated live-PDS journey skipped |
| Exact-location Chromium journey | Passed in 9.7 seconds inside the full gate using two isolated authenticated browser contexts and a real `RTCPeerConnection`/data channel |
| Playwright artifact redaction | Passed with coordinate, session-ID, and peer-proof markers; no failure artifacts were retained |
| `npm run test:coverage` | 952 passed, 81 environment-gated tests skipped; 48.82% statements, 38.49% branches, 42.82% functions, 49.73% lines |
| `npm audit --audit-level=high` | 0 vulnerabilities |

Focused PostgreSQL and HTTP tests proved:

- participant-only access, active accepted connection enforcement, and
  session-derived identity;
- fresh mutual consent, requester/offerer and helper/answerer roles, one answer
  per session, expiry, revoke, and restart loss;
- immediate failure after a bilateral block, connection cancellation, account
  deactivation, moderation authorization loss, or maintenance;
- strict rejection of coordinate-shaped signal payloads;
- absence of any exact-person location/session/signal table or column.

The repository absence gate scans all API, indexer, and moderation migrations;
all AT lexicons; coordination and account-export surfaces; PostgreSQL
backup/restore scripts; and location-related HTTP logging. The browser API test
asserts that consent, signaling, and revoke request bodies contain no identity
or coordinate. The two-context Chromium test separately asserts that the exact
test coordinate never enters any intercepted HTTP request, then proves refresh
removes it from the DOM and maintenance fails closed.

## External and operational boundary

This phase did not use live PDS credentials, a protected staging deployment, or
a managed TURN service. The successful peer test ran between isolated Chromium
contexts on the local acceptance host with no third-party ICE server. Protected
cross-network/NAT repetition remains external evidence; it does not weaken the
implemented no-persistence boundary.

The operational decision in
[`alpha-go-no-go.md`](./phase-8/alpha-go-no-go.md) remains **NO-GO**. Phase 4
completion does not approve public availability, supply missing external
credentials, or represent attachments, notifications, the broader maintenance
program, legal review, accessibility review, or launch evidence as complete.
