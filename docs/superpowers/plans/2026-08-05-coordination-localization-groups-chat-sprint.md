# Coordination, localization, groups, and chat sprint

Status: implementation and immutable home-staging release verified; operational NO-GO unchanged

Date: 2026-08-05 (America/Chicago)

This plan productizes the previously deferred coordination scheduling, groups,
and bounded text chat surfaces and completes the English/Spanish runtime. It
does not authorize public launch and does not change the operational `NO-GO`.
The PDS remains authoritative for user-owned public records; PostgreSQL remains
authoritative for private operational state.

## Boundary audit

- Durable accepted connections already live in `coordination_connections` and
  are guarded by authenticated, CSRF-protected, idempotent HTTP mutations.
  `CoordinationService.assertSafety` rechecks request state, bidirectional
  blocks, account deactivation, and moderation eligibility.
- `services/api/src/scheduling-service.ts` is an unwired, process-local
  volunteer-shift fixture. It accepts caller-supplied identities, lacks durable
  authorization and concurrency, and must not be exposed or reused for the new
  connection scheduling runtime.
- `services/api/src/group-service.ts` is an unwired, process-local group
  fixture with caller-supplied authority and no secure invitation lifecycle.
  Production groups require a new PostgreSQL service and authenticated routes.
- `services/api/src/chat-service.ts` is an unwired fixture. The production API
  intentionally exposes no chat mutation/history routes and the web route is a
  placeholder. A new durable bounded-text service must replace this boundary;
  fixture constructors remain test-only until removal after acceptance.
- The web uses i18next resources, but the production shell still contains many
  literal English strings and native `toLocaleString()` calls without an
  explicit locale. Scheduling, group, and chat production components do not
  yet exist. Locale preference persistence exists in account settings but is
  not applied comprehensively to the shell.
- Account export/deactivation, retention jobs, durable notification outbox,
  activity inbox, moderation queue, and exact-location artifact checks already
  provide patterns that each new slice must extend.
- Exact personal location remains intentionally ephemeral and is prohibited
  from schedules, groups, chat structured metadata, URLs, logs, analytics,
  audit rows, notification payloads, exports, and test artifacts.
- Chat will be server-readable stored text protected in transit and at rest by
  deployment controls. It is not end-to-end encrypted; no E2EE claim is
  permitted without a separate implementation and key-lifecycle review.

## Vertical slices and acceptance criteria

### 1. Connection scheduling

Add migrations for proposals, bounded events, reminder/notification intent,
retention deadlines, and optimistic versions. Add a PostgreSQL service and
authenticated/idempotent routes for list, propose, accept, decline,
counter-propose, and cancel. Persist canonical UTC instants plus the originating
IANA timezone. Validate real time zones, start-before-end, future/expiry bounds,
DST-normalized inputs, participant conflicts, and expected version. Every
mutation must lock the connection and schedule, call the same live connection
safety checks, and commit state/event/inbox/notification intent atomically.

Acceptance: both accepted-connection participants complete propose → counter or
accept → confirmed → reminder-eligible → cancel/expire across restart. Duplicate
keys replay safely; stale, conflicting, unauthorized, blocked, moderated, and
deactivated operations fail closed. Export and deactivation are safe. Browser
UI covers validation, empty/loading/conflict/stale states, keyboard/focus,
320px reflow, and 200% text.

### 2. English/Spanish runtime

Route every production-visible string, validation/error/empty/loading state,
notification template, date/time/duration/number/plural, and accessibility label
through locale resources. Persist `en`/`es` via account preferences and a safe
anonymous local preference. Switching language must preserve current form and
URL state. Add key-parity, missing-key, interpolation, bundle, component,
Chromium, reflow, keyboard, focus, and axe gates. Professional translation
review remains an external launch gate.

### 3. Durable groups

Add PostgreSQL groups, memberships, rooms, hashed expiring single-use
invitations, bounded audit events, notification intent, and retention. Implement
owner/moderator/member capabilities; invite/accept/reject/revoke, removal,
role changes, departure, ownership transfer, closure, and authorized optional
request-linked rooms. Recheck membership, role, request visibility, blocks,
deactivation, and moderation on every operation. Prevent enumeration and
cross-group access. Extend export/deactivation and add accessible production
UI/navigation. Remove or make unreachable fixture paths.

Acceptance: ownership and invitation lifecycle survives restart; every role and
membership transition takes effect immediately; request-linked room access is
intersection-authorized; cross-group and enumeration probes fail closed.

### 4. Durable bounded text chat

Add direct conversations bound to active accepted connections and room
conversations bound to active group membership. Persist bounded text messages,
deduplication, chronological cursor pagination, delivery/read state, redaction,
retention deadlines, privacy-safe notification intent, and minimal abuse-report
evidence. Enforce authentication, CSRF, rate/size limits, current authorization,
blocks, deactivation, closure, and moderation on every read/mutation. Message
bodies must never enter URLs, logs, metrics, audit rows, notification payloads,
list previews, or unrelated moderation history.

Acceptance: direct and group journeys survive reload/restart and immediately
terminate access after block, removal, closure, or deactivation. Duplicate,
stale, oversized, rate-limited, malformed, and cross-scope requests fail closed.
Exports disclose only the account's safe data. The UI states the server-readable
trust model and retention honestly and passes responsive accessibility gates.

### 5. Phase and release gates

After every slice run focused unit, HTTP, migration, and fresh-PostgreSQL
integration tests, then the full repository check and production-bundle Chromium
suite. Before staging run migration replay, restart/concurrency/idempotency,
retention/export/deactivation, privacy/artifact redaction, exact-location
absence, dependency audit, image scan, and Prometheus rule validation. Update
the charter, roadmap, matrix, privacy/trust documentation, evaluator material,
and evidence using only verified results.

Create focused commits, synchronize `main` with `origin/main`, build exact-revision
images once, scan/sign/digest-pin, back up and validate restore, deploy through
the immutable staging workflow, retain rollback, and verify migrations,
readiness, health, revision labels, restarts, logs, public contracts, and live
browser behavior. Protected provider delivery, independent security/privacy/
accessibility/translation review, named ownership, credentialed external
exercises, and the operational `NO-GO` remain external gates.
