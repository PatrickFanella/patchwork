# Buyer-ready Phase 0 contract and safety evidence

Date: 2026-07-28

Scope: Phase 0 of
[`2026-07-28-buyer-ready-web-completion-roadmap.md`](../../superpowers/plans/2026-07-28-buyer-ready-web-completion-roadmap.md).

## Result

Phase 0 is complete at the contract boundary. This evidence does not claim that
later buyer-ready subsystems have durable runtime paths.

- ADR 0003 now prohibits server persistence of personal exact coordinates and
  defines the authenticated, mutually consented, short-lived, coordinate-free
  signaling boundary for a future WebRTC exchange.
- Exact public addresses are directory-only and require active organization
  and resource verification, separate active moderator approval, current
  expiry, and a non-confidential classification.
- Strict executable schemas cover approximate personal, no-permanent-address,
  transient exact-personal, exact-public-resource, origin/provenance,
  versioned 18+ consent, and chat-placeholder cases.
- Browser mutation schemas reject server-controlled origin, approval, and
  authorship fields.
- Capability contracts and negative tests cover organization administration,
  verification review, exact-public-address approval, attachment review, and
  maintenance mode.
- Production API contracts expose no chat mutation route. Production web map
  and feed omit chat actions, and `/chat` is a truthful placeholder with no
  history, initiation, or mutation controls.

## Verification

The Phase 9 command set was run from a clean `npm ci` install:

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test` | Passed |
| API PostgreSQL integration | 33 passed |
| Web direct service integration | 9 passed |
| `npm run build` | Passed |
| Web Chromium E2E | 57 passed, 1 credential-gated live-PDS journey skipped |
| `npm run test:coverage` | 921 passed, 66 environment-gated tests skipped |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |

PostgreSQL integration used a fresh local PostgreSQL 16 container after
applying the repository's 13 API, 4 indexer, and 3 moderation migrations. No
credential values were written to evidence or command output.

The root coverage runner was corrected to use the same-origin `/api` unit-test
contract instead of loading the operator `.env`. The local acceptance host
uses serial Chromium execution and a 60-second per-test limit to avoid
concurrent cold-transform blank pages. Playwright 1.58 cannot install a browser
for the host's Ubuntu 26.04 classifier, so the verified run used the existing
Playwright-managed Chrome-for-Testing 151 binary through the explicit
`PATCHWORK_E2E_CHROMIUM_EXECUTABLE` override.

## Authority boundary

The operational decision in
[`alpha-go-no-go.md`](./phase-8/alpha-go-no-go.md) remains **NO-GO**. Phase 0
authorizes and verifies feature contracts only; it does not approve a public
service, refresh launch evidence, or make any later contract-only subsystem a
runtime capability.
