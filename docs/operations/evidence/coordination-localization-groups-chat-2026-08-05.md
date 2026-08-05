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
| Prometheus rules | Repository file passed `promtool` with 18 rules; staging loaded and reloaded the same 18-rule file successfully. On-call cleanup added `owner="patchwork-primary-on-call"` to all 18 rules, revalidated them in the running Prometheus container, reloaded the exact repository checksum, and confirmed all 18 through the live rules API. |
| Playwright artifact redaction | Passed; no retained failure artifacts were present after the clean focused runs |
| Backup/restore tooling | An archive aimed at the wrong local PostgreSQL 16 database exposed the client/server mismatch risk and was quarantined. The script now rejects mismatched client/server majors. It correctly rejected PostgreSQL 16 tooling for the configured PostgreSQL 17 staging server. |
| Staging backup/restore | Matching PostgreSQL 17 backup `patchwork_20260805_091609.dump` (312,971 bytes) passed checksum/archive validation and restored into isolated empty PostgreSQL 17 in 2 seconds with a 42-second recovery-point age, scheduling/group/chat tables present, and zero restored sessions. |

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

## Immutable home-staging release

Revision `55f724a8f0efbb533ddb163f06cc0ff27c617334` was pushed to `origin/main`.
Four runtime targets were built once with that full OCI revision, scanned
before push with Trivy 0.59.1, pushed to the loopback registry, digest-pinned,
signed with the scoped local staging Cosign key, and verified against its
retained public key. All four scan reports contain zero HIGH/CRITICAL findings.
The local signatures intentionally have no transparency-log proof and are not
represented as protected GHCR/OIDC evidence.

| Service | Deployed digest |
| --- | --- |
| API | `sha256:484966e4660bcb131e9b7e8927e52eeff218a0a58e7642894b7b32445916892e` |
| Indexer | `sha256:98c563ef6b1e62e8d8907fd4a3c5cdb0d8295ce4f944edd076f56c62bc0aa9f0` |
| Moderation | `sha256:e117863640bff40478929bb9712d38bd0b681f1226023615cffedf1a61604644` |
| Web | `sha256:aebb85d82ca8248b5e5729103080c3b4d788ffb47a6cdcc1650484acd258a667` |

The deployment applied API migrations 0023–0025 and skipped the already
applied 22 API, 6 indexer, and 5 moderation migrations. All four services
reported the exact revision, healthy status, zero restarts, and no
error/fatal/exception/unhandled log lines. Public readiness, status, Map,
Groups, Chat, content-addressed PMTiles range, and contract probes passed; the
mutable tile path returned 404. Contracts advertise scheduling, groups, and
bounded chat while omitting `/chat/initiate`.

A live clean Chromium session confirmed the production Chat auth gate, the
server-readable legal disclosure, English-to-Spanish switching, and the
Spanish Groups auth gate. Prometheus loaded and reloaded all 18 repository
rules. Release state retains `43deb5e9` as the immediate rollback manifest.

## Post-release truthfulness and ownership cleanup

Commit `9073901f` removed the obsolete exported “Chat is not available”
contract, its self-validating test, the unused 928-line in-memory
`GroupService`, and the volunteer draft's placeholder-DID fallback. The
experimental group-coordination, reputation, mobile, multi-region, matching,
and connector stubs remain intentionally available for future experiments and
are not imported as production implementations. The authoritative matrix,
README, historical gap/screenshot labels, game-day record, and operations
documents now distinguish current behavior from dated evidence.

The post-cleanup `npm run check` passed lint, typecheck, 1,017 runnable tests,
map validation, and the 45-surface exact-location absence gate. The staging
Prometheus file was backed up as
`patchwork.yml.pre-owner-labels-20260805T1306Z`, then replaced with the exact
repository checksum `e2f67e42a883e12168fff7d6cd76878b3ab967c49e8f3efe3ce29196bd3e4d4b`.
Container-local `promtool` found 18 rules, reload/readiness passed, and the live
rules API returned all 18 with `owner="patchwork-primary-on-call"`.

The complete pushed cleanup revision
`7c7b4142b2055e153e1058c7e54003a63fc22214` was then built once into four
runtime targets, scanned before publication with Trivy 0.59.1 at zero
HIGH/CRITICAL findings, pushed to the loopback registry, signed with the scoped
local staging key, and verified against its public key. The immutable deploy
replayed all migrations with 25/6/5 skips and zero new applications. All four
services report the exact revision, healthy status, and zero restarts; public
readiness/routes/contracts, clean logs, and obsolete `group-service.js`
absence passed. Release state retains `55f724a8` as immediate rollback.

| Service | Cleanup-release digest |
| --- | --- |
| API | `sha256:3896b77335a1c547470d77ab2b9557644072e754e54889ce9f24a721ebee8c63` |
| Indexer | `sha256:b3eda578f719b65c7c632ea97a3e3e35c82cc7a168fa768cccfbebd4011ae55c` |
| Moderation | `sha256:0a12b0e725fdb0c31911d9bfcdf88317b38c395c5cbb948300197d8ceb4ee9b6` |
| Web | `sha256:5bea6a3e62f9b4febb20ff59ab3d44c273e6db36d71b37fd54ab1dade90d29a6` |

Pre-deploy archive `patchwork_20260805_182117.dump` (312,971 bytes) passed
checksum/archive validation and restored into a fresh isolated PostgreSQL 17
container in 6 seconds with scheduling, groups, and chat tables present and
zero browser sessions; the container was removed. The audit also found that
`patchwork-staging-backup.timer` still targeted the local PostgreSQL 16
development container and wrote metrics to an obsolete path. The installed
wrapper now derives the target from the running staging API, runs matching
PostgreSQL 17 tools, and publishes a `0644` metric for the `nobody`
node-exporter process while keeping archives `0600`. Two service runs produced
validated ~313 KB staging archives, and Prometheus returned backup success.
Nine ~149 KB local-development archives and their sidecars were moved to
recoverable `quarantine/local-postgres16`; no archive was deleted.

## Latest synchronized immutable release

The exact synchronized application revision
`d791fb015fb2d6839b509bc3f873b3062d4a8b49` was built once after the scheduled
backup correction was committed and pushed. Trivy 0.59.1 found zero
HIGH/CRITICAL vulnerabilities across all four images before publication. Each
digest was signed with the scoped local staging key and verified against the
retained public key; these signatures retain the same documented no-tlog,
home-staging boundary.

| Service | Deployed digest |
| --- | --- |
| API | `sha256:e313893f88f551509d3096744aad97bd9d8e34877cf7cd4fc68482cda7bd29f1` |
| Indexer | `sha256:decf62f78df03d80803bf57b8600323c6d06abb64ee07dbbafdde9bc0e96c8e0` |
| Moderation | `sha256:3c15b888f48c8845d0cae5bd577bd792f25fe0031d4c57e694d967a61b978b98` |
| Web | `sha256:4abe44e2b5d1dd82014c805cf8321bb369b0715211df31f0fe77a5bc71038a00` |

Pre-deploy timer archive `patchwork_20260805_185159.dump` passed checksum and
archive validation and restored into a fresh PostgreSQL 17 container in 7
seconds with scheduling/group/chat tables present and zero browser sessions;
the disposable container was removed. The immutable deployment applied zero
new migrations and skipped API 25, indexer 6, and moderation 5. All four
services report the exact revision, healthy state, and zero restarts. Public
readiness, status, Map, Groups, Chat, content-addressed PMTiles range, mutable
tile denial, contract inclusion/legacy-route absence, clean logs,
obsolete-module absence, 18 owned alert rules, and current/rollback manifest
checks passed. The post-deploy systemd job published and checksummed
`patchwork_20260805_185911.dump`; Prometheus reported backup success. Release
state retains `7c7b4142` as the immediate rollback manifest.

## Residual launch gates

The operational decision remains **NO-GO**. Professional Spanish translation
review; independent security, privacy, and WCAG/assistive-technology review;
formal legal approval; a distinct secondary responder and sustained operations
coverage; protected provider delivery; credentialed external exercises;
independent backup durability; and production capacity/operations are not
supplied by this sprint. Patrick Fanella accepted the interim home-staging
primary on-call and escalation-owner roles on 2026-08-05.
