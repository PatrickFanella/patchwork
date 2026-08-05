# Coordination, localization, groups, and chat sprint evidence

Date: 2026-08-05 (America/Chicago)

Decision: **feature-development acceptance; operational NO-GO unchanged**

This record covers durable accepted-connection scheduling, complete English and
Spanish production localization, role-controlled groups, and bounded
server-readable text chat. It is repository and local staging evidence, not an
independent security, privacy, accessibility, legal, translation, durability,
or production-operations approval.

## Implemented boundaries

- Scheduling stores versioned canonical UTC intervals plus the originating
  IANA timezone. It rechecks the accepted connection, request, block,
  deactivation, and moderation state on every operation.
- Groups store bounded metadata, memberships, rooms, audit events, and only a
  SHA-256 hash of a 32-byte single-use invitation token. Invitations expire
  after seven days. Roles are owner, moderator, and member.
- Direct chat requires an active accepted connection and eligible request.
  Room chat requires a current active membership and room/group eligibility.
- Chat is server-readable and not E2EE. Text is limited to 2,000 characters,
  active sends are limited to 20 per author per minute, client UUIDs deduplicate
  retries, pagination is chronological, and sender redaction is bounded to 24
  hours. Message retention is at most 365 days.
- Message text is absent from URLs, conversation-list previews, notification
  and activity payloads, audit rows, metrics, and moderation queue history.
  Abuse-report evidence stores only a digest, character count, identifiers,
  and timestamps for 30 days.
- Account export exposes only the account's safe chat view. Deactivation
  redacts authored message text and either transfers or closes owned groups.
- Every production route has English and Spanish resources. The locale is
  stored anonymously in local storage and, for authenticated accounts, in the
  durable account preference. Switching preserves current form and URL state.

## Verified results

| Gate | Result |
| --- | --- |
| Repository `npm run check` | Passed: 1,018 runnable unit/service tests across web, API, indexer, moderation worker, AT client/lexicons, and shared packages; exact-location absence scanned 45 durable/schema/export/backup/logging surfaces |
| English/Spanish static gate | Passed: 35 key-parity, interpolation, and raw production JSX checks |
| Fresh API PostgreSQL integration | Passed: 19 files, 77 tests, including scheduling, groups, chat, privacy export/deactivation, notifications, and attachments |
| Fresh indexer PostgreSQL integration | Passed: 6 files, 52 tests |
| Fresh moderation PostgreSQL integration | Passed: 12 files, 71 tests |
| Fresh migration replay | First run applied API 25, indexer 6, moderation 5 migrations; immediate replay applied 0 and skipped 25/6/5 |
| Focused group browser | Passed owner create, invitation token handling, room creation, 320px/200% reflow, and axe scan |
| Focused chat browser | Passed duplicate-safe retry, read, redaction, reporting, body-free list presentation, honest trust copy, Spanish/offline draft behavior, and axe scan |
| Production Chromium matrix | Clean final run passed 147 cases with one credentialed live-PDS case skipped (148 discovered); 9.2 minutes, serial Chromium against a fresh production bundle |
| Dependency audit | `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities |
| Prometheus rules | Repository file passed `promtool` with 18 rules; currently deployed pre-sprint file passed with 11 rules |
| Playwright artifact redaction | Passed; no retained failure artifacts were present after the clean focused runs |

## Privacy and failure evidence

PostgreSQL journeys exercise restart reconstruction, duplicate replay,
chronological cursors, read receipts, redaction, report evidence, oversized and
rate-limited rejection, outsider/cross-scope denial, bilateral block denial,
immediate group-member removal, owner deactivation, and group ownership
transfer. HTTP tests prove the actor comes from the authenticated session while
hostile actor fields are ignored and every mutation stays on the idempotent
JSON path. The legacy `/chat/initiate` route remains absent from the advertised
contract and returns `404`.

Exact personal location remains excluded from schedules, groups, chat
metadata, exports, notifications, audit rows, and backups. It can move only
through the separately authorized ephemeral peer channel.

## Residual launch gates

The operational decision remains **NO-GO**. Professional Spanish translation
review; independent security, privacy, and WCAG/assistive-technology review;
formal legal approval; named operational ownership; protected provider
delivery; credentialed external exercises; independent backup durability; and
production capacity/operations are not supplied by this sprint.
