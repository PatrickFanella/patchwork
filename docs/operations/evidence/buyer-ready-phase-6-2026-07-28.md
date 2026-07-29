# Buyer-ready Phase 6 notification evidence

Date: 2026-07-28

Scope: Phase 6 of
[`2026-07-28-buyer-ready-web-completion-roadmap.md`](../../superpowers/plans/2026-07-28-buyer-ready-web-completion-roadmap.md).

## Result

Phase 6 is complete at the repository and local configured-provider boundary.

- PostgreSQL now stores audience-bound notification intent, versioned
  templates, deduplication keys, bounded metadata, read/archive state,
  verified email destinations, Web Push subscriptions, delivery attempts,
  locks, retry timing, provider idempotency, feedback, invalid-target cleanup,
  dead letters, and retention.
- Offer, connection, lifecycle, verification, appeal, expiry, moderation,
  attachment-review, and organization-reconfirmation transactions create
  notification intent atomically. A rolled-back domain transaction leaves no
  notification, and replaying the same source key creates no duplicate.
- Authenticated HTTP routes derive the recipient from the restored session and
  expose list/filter/unread/read/archive plus email verification and push
  register/revoke controls. Hostile actor or recipient fields cannot select
  another account. Push endpoints cannot be reassigned between accounts.
- Production configuration requires a provider-neutral HTTPS email endpoint,
  provider bearer token/from address, VAPID subject/public/private keys, and a
  separate feedback-webhook bearer token. The delivery worker claims rows with
  restart-safe locks, applies exponential backoff, retries transient errors,
  dead-letters exhausted/permanent failures, and disables bounced email or
  invalid push destinations.
- External email and push payloads contain only title, bounded body, and a
  Patchwork action path. Exact locations, approximate coordinate fields,
  street addresses, private evidence, contact fields, report details,
  moderation notes, messages, and credentials are rejected from durable
  metadata and omitted from external payloads.
- The web notification center provides active/read/unread/archived views,
  unread counts, mark-read/mark-unread/mark-all/archive actions, related
  activity links, verified-email setup/disable, and explicit browser-push
  enable/revoke. Browser permission is requested only from the Enable action.
  The service worker renders bounded notifications and opens only same-origin
  paths.
- Account export includes safe notification content and endpoint status but
  excludes verification-token hashes, push endpoints, subscription keys,
  provider identifiers, and delivery internals. Deactivation deletes all
  notification intent, email endpoints, push subscriptions, and cascading
  delivery attempts.
- Metrics and alerts cover pending/retrying delivery, dead letters, oldest
  pending age, and sweep failure. The incident runbook preserves endpoint,
  subscription-key, body, exact-location, evidence, and moderation-note
  confidentiality.

The operational **NO-GO** remains unchanged.

## Verification

| Gate | Result |
| --- | --- |
| Fresh database migration | Passed from zero: API 20, indexer 5, moderation 3 |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test` | Passed: web 236; API 293 plus 67 environment skips; indexer 35 plus 17 skips; moderation 53 plus 11 skips; AT client 26; lexicons 5; shared 322; map and exact-location absence scripts passed |
| API PostgreSQL integration | 63 passed across 15 files on the fresh Phase 6 database |
| Notification/privacy PostgreSQL focus | 8 passed, including atomic rollback, source matrix, restart, idempotency, retry, invalid cleanup, dead letter, export, and deactivation |
| Provider adapters and HTTP boundary | 6 focused tests passed for HTTPS email, VAPID delivery, safe provider error mapping, stable idempotency, session ownership, explicit push opt-in, and feedback bearer authentication |
| Web API client | 29 passed, including notification queries/mutations and absence of browser-supplied identity |
| Web direct service integration | 8 passed |
| Production and staging Compose validation | Passed with complete email, VAPID, feedback-token, and worker-interval configuration required |
| `npm run build` | Passed |
| Web Chromium E2E | 70 passed; 1 credential-gated live-PDS journey skipped |
| Notification Chromium journey | Passed for durable list/read/filter state, verified-email setup, no automatic push permission, explicit subscribe, and revoke |
| Playwright artifact redaction | Passed; the successful gate retained no failure artifacts |
| `npm run test:coverage` | 970 passed, 95 environment-gated tests skipped; 47.02% statements, 37.05% branches, 41.83% functions, 47.88% lines |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| `npm audit --audit-level=high` | 0 vulnerabilities |

The notification source-matrix test observes all required Phase 6 sources:

- offer received/accepted and offer expiry;
- connection started/completed/cancelled;
- request lifecycle changes;
- verification submission, decision, and annual expiry;
- appeal submission and decision;
- report/moderation action;
- attachment moderator action and organization reconfirmation are installed as
  database triggers and share the same constrained enqueue function.

Restart tests reconstruct the service around the same PostgreSQL pool after a
transient provider failure, retain the same idempotency key, and deliver the
retry once. Invalid subscriptions are revoked with a bounded reason code.
Permanent delivery rejection produces an operator-visible dead letter.

## External and operational boundary

The email adapter was exercised against its real HTTPS request contract with
a local intercepted transport; the VAPID adapter used the real `web-push`
runtime contract with an intercepted network call. No protected staging email
account, production VAPID credentials, production provider webhook, or human
alert channel was used. Protected-staging delivery, live bounce/invalid
feedback, credential rotation, backup/restore of notification state, capacity,
and human incident response remain external operational evidence.

The operational decision in
[`alpha-go-no-go.md`](./phase-8/alpha-go-no-go.md) remains **NO-GO**. Phase 6
completion does not approve public availability or represent automated
moderation, the moderator console, broader maintenance controls, legal review,
independent accessibility review, or launch operations as complete.
