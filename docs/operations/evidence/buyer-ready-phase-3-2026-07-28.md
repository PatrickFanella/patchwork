# Buyer-ready Phase 3 coordination evidence

Date: 2026-07-28

Scope: Phase 3 of
[`2026-07-28-buyer-ready-web-completion-roadmap.md`](../../superpowers/plans/2026-07-28-buyer-ready-web-completion-roadmap.md).

## Result

Phase 3 is complete at the repository and local durable-runtime boundary.

- Migration `0018_coordination_offers_inbox_outcomes.sql` persists offers,
  accepted connections, private transition events, per-user activity/read
  state, and structured outcome feedback.
- Offer, accept, decline, cancel, expiry, connection completion, and connection
  cancellation recheck request state, session-derived ownership, account
  deactivation, bilateral blocks, moderation quarantine, and volunteer
  eligibility. Acceptance updates the existing assignment ledger; completion
  updates the handoff ledger.
- Pending offers do not disclose the volunteer DID to the requester. Participant
  identities appear only after an accepted connection and only on
  participant-authenticated routes.
- Matching ranks eligible volunteers and verified, actively stewarded resources
  using category, approximate distance, availability, language, accessibility,
  and verification. It excludes blocked, inactive, expired, unavailable,
  moderated, quarantined, and unauthorized candidates.
- Match results use one deterministic global order, opaque volunteer references,
  readable factor explanations, and `manual-only` assignment. They do not
  calculate or expose a reputation score.
- The authenticated production `/inbox` workspace discovers requests, creates
  and decides offers, manages connections, requests match suggestions, records
  outcomes, and marks activity read. It contains no chat, message, or
  conversation category.
- Outcome input is available only after a completed connection, only to a
  participant, once per participant. It uses bounded fields and controlled tags,
  including a structured safety-concern signal, and has a one-year retention
  boundary.
- Account export includes authorized coordination state. Deactivation removes
  the subject's inbox/outcomes/offers and cascades connection state where the
  subject-owned offer or request is removed.
- The former process-local inbox, matching, feedback services and their unused
  web view-model counterparts were deleted. Production has no fixture fallback
  for this subsystem.

The operational **NO-GO** remains unchanged.

## Verification

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test` | Passed: web 232, API 278 plus 51 environment skips, indexer 35 plus 17 skips, moderation 53 plus 11 skips, AT client 26, lexicons 5, shared 320; map-script tests passed |
| API PostgreSQL integration | 48 passed across 12 files |
| Web direct service integration | 8 passed |
| `npm run build` | Passed |
| Web Chromium E2E | 66 passed, 1 credential-gated live-PDS journey skipped, and 1 unrelated posting navigation passed on its configured retry |
| Playwright artifact redaction | Passed across 2 retained navigation artifacts with private evidence, contact, report-detail, and invitation-token markers |
| `npm run test:coverage` | 949 passed, 79 environment-gated tests skipped; 50.21% statements, 39.63% branches, 43.69% functions, 51.15% lines |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |

Focused PostgreSQL tests proved:

- pending-offer identity privacy before and after service reconstruction;
- accepted identity disclosure, assignment creation, handoff completion, and
  durable audit/inbox state;
- participant-only outcome submission, duplicate suppression, retention,
  export, and deactivation cleanup;
- block and request-state rechecks between offer and acceptance;
- automatic offer expiry and restart-visible expired state;
- deterministic matching, factor explanations, verification influence, opaque
  volunteer references, and absence of reputation/automatic assignment.

The two-context Chromium journey used distinct authenticated requester and
helper session identities. It proved discover, offer, pre-acceptance identity
privacy, decline, re-offer, accept, post-acceptance identity disclosure,
explainable matching, completed handoff, structured outcome submission, and
expired-offer rendering through the production web components. HTTP transport
was controlled by Playwright; PostgreSQL durability and authorization were
proved separately by the real service boundary tests. No process-local product
service was involved.

## External and operational boundary

This phase did not consume live PDS credentials or repeat the journey against a
protected staging deployment. Matching fairness was proved deterministically at
policy boundaries, not evaluated on pilot population/outcome data. The
safety-concern outcome tag is bounded abuse input; creation of an automated
moderation case remains Phase 7. External delivery of activity notifications
remains Phase 6.

The operational decision in
[`alpha-go-no-go.md`](./phase-8/alpha-go-no-go.md) remains **NO-GO**. Phase 3
completion does not approve public availability, refresh launch evidence, or
represent attachments, exact-person exchange, external notifications, or the
later moderation program as complete.
