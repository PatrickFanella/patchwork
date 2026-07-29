# Buyer-ready Phase 5 attachment evidence

Date: 2026-07-28

Scope: Phase 5 of
[`2026-07-28-buyer-ready-web-completion-roadmap.md`](../../superpowers/plans/2026-07-28-buyer-ready-web-completion-roadmap.md).

## Result

Phase 5 is complete at the repository and local real-service boundary.

- Production startup now requires a private S3-compatible object store and a
  clamd scanner. Compose uses pinned MinIO and ClamAV images on an internal
  network with private storage, health checks, persistent volumes, and
  fail-closed credentials.
- Upload authorization is authenticated and owner-bound. The server generates
  randomized object keys and enforces purpose, declared and detected MIME,
  content signatures, a 10 MB per-file limit, 25-file/50 MB owner quotas, and a
  ten-minute upload expiry. Neither object keys nor upload tokens are placed in
  public responses, URLs, exports, or logs.
- Clean images are decoded, re-encoded, and stripped of metadata. PDFs are
  structurally validated. Original and derivative objects are both scanned by
  clamd; malware and uncertain content fail closed into quarantine. Attempts,
  retry count, scanner result, moderator decisions, and deletion jobs survive
  restart in PostgreSQL.
- Only clean content can receive an authenticated, actor-bound, 60-second
  access URL. Owners, authorized verification reviewers, and authenticated
  aid-post viewers have separate authorization checks. The web exposes
  posting, verification-evidence, owner preview/delete, and moderator
  preview/quarantine/rescan/delete journeys without revealing storage keys.
- Original and derivative objects are deleted after owner/moderator removal,
  subject deletion, account deactivation, workflow-policy expiry, or retention
  expiry. Failed deletion is retried durably; orphan reconciliation repairs
  database/object drift, and Prometheus rules alert on deletion backlog and
  attachment-pipeline failure.
- Account export contains bounded safe attachment metadata only. Account
  deactivation removes attachment rows and queues both object variants for
  deletion.

The operational **NO-GO** remains unchanged.

## Verification

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test` | Passed: web 234, API 287 plus 62 environment skips, indexer 35 plus 17 skips, moderation 53 plus 11 skips, AT client 26, lexicons 5, shared 321; map and exact-location absence scripts passed |
| API PostgreSQL integration | 58 passed across 14 files |
| Real attachment integration | Passed against local MinIO and clamd, including clean transform/access, custom malware signature quarantine, service reconstruction, account-style deletion, moderator deletion, and removal of three original/derivative objects |
| Web direct service integration | 8 passed |
| Production and staging Compose validation | Passed, including private object/scanner health dependencies and stable internal service DNS |
| `npm run build` | Passed |
| Web Chromium E2E | 68 passed; 1 credential-gated live-PDS journey skipped; one unrelated transient blank-page accessibility case passed its configured retry |
| Attachment Chromium journey | Passed inside the full gate after a focused pass; proved raw private upload, created-post subject binding, header-only upload capability, and absence of object keys |
| Verification Chromium journey | Passed with private evidence upload, clean-only selection, reviewer access, appeal, renewal, and exact-address approval |
| Playwright artifact redaction | Passed across 2 retained files using the disposable coordinate, upload-token, byte-marker, and test-identity terms |
| `npm run test:coverage` | 961 passed, 90 environment-gated tests skipped; 47.81% statements, 37.92% branches, 42.22% functions, 48.68% lines |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| `npm audit --audit-level=high` | 0 vulnerabilities |

Focused PostgreSQL and real-service tests prove:

- clean image transformation, metadata stripping, authenticated short-lived
  access, and restart reconstruction;
- MIME spoof rejection, real clamd malware quarantine, uncertain/zero-page PDF
  retry, three-attempt exhaustion, and reviewer rescan;
- atomic upload completion under concurrency;
- owner, reviewer, and authenticated aid-post access boundaries;
- owner, moderator, subject, account, archived-workflow, and policy-retention
  deletion;
- failed-deletion retry, orphan reconciliation, and clean missing-object
  quarantine;
- safe export metadata without object keys, file bodies, access URLs, or
  upload tokens.

Fresh migration application reached API migration 19 and indexer migration 5
in a non-destructive Phase 5 database. The existing development database was
not rewritten because its pre-existing migration-17 checksum differs from the
current repository history.

## External and operational boundary

The real integration used local private MinIO and ClamAV containers plus a
test-only clamd signature. It did not use protected staging credentials,
production object-storage credentials, or production malware definitions.
Protected staging repetition, backup/restore of attachment metadata and
objects, credential rotation, capacity, and human incident response remain
external operational evidence.

The operational decision in
[`alpha-go-no-go.md`](./phase-8/alpha-go-no-go.md) remains **NO-GO**. Phase 5
completion does not approve public availability or represent notifications,
automated moderation, broader maintenance controls, legal review,
accessibility review, or launch operations as complete.
