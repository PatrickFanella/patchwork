# Buyer-ready Phase 9 feature-completion acceptance

Date: 2026-07-29  
Verified revision: `6025cb2d`  
Feature decision: **COMPLETE at the repository and configured-runtime boundary**  
Operational decision: **NO-GO**

> Superseding verification note (2026-08-04): the original completion decision
> remains valid. Current counts, the post-roadmap product-gap fixes, and the
> fresh acceptance rerun are recorded in
> [`buyer-ready-product-gap-sprint-2026-08-04.md`](./buyer-ready-product-gap-sprint-2026-08-04.md).
> Historical counts below describe the 2026-07-29 run.

## Conclusion

Every capability included by the
[buyer-ready web charter](../../product/buyer-ready-web-charter.md) has a real
authenticated or public runtime path backed by durable state or its intended
external adapter. No included capability remains `fixture-runtime` or
`contract-only`. Fixture chat is unreachable in production, and the Chat page
is a truthful non-mutating placeholder.

This acceptance does not approve public operation. The independent,
credentialed, and named-owner gaps under
[Remaining risk](#remaining-risk-and-operational-no-go) remain hard NO-GO
conditions.

## Clean acceptance gate

Dependencies were reinstalled with `npm ci`. A fresh
`patchwork_phase9_completion_20260729` database was created and migrated from
zero. The test harness itself was corrected during the review so
`npm run test:e2e -w @patchwork/web` builds the web application and serves the
result with `vite preview`; the authoritative result below is against that
production bundle, not Vite's development server.

| Gate | Result |
| --- | --- |
| `npm ci` | 322 packages installed; 331 audited; 0 vulnerabilities |
| Fresh migrations | API 22, indexer 6, moderation 5 |
| Showcase replay | Two runs produced 15 records and the identical manifest `e6531c473a615e5d188d922c8b1c49c04881dbefc20260a72c302a457df40d11` |
| `npm run lint` | All workspaces passed |
| `npm run typecheck` | All workspaces passed |
| `npm run test` | Web 237; API 303 with 74 environment skips; indexer 35 with 17 skips; moderation 53 with 18 skips; AT client 26; lexicons 5; shared 322; map and 42-surface exact-location absence checks passed |
| API PostgreSQL integration | 68 passed across 16 files |
| Indexer PostgreSQL gate | 52 passed |
| Moderation PostgreSQL gate | 71 passed |
| Real object/scanner integration | 1 passed against isolated MinIO and ClamAV: transform, scan, restart access, quarantine, and physical deletion |
| Web service integration | 8 passed |
| `npm run build` | All workspaces passed; Vite reported only its existing bundle-size advisory |
| Production-bundle Chromium | 96 passed in 5.1 minutes; 1 credential-required live OAuth/PDS journey skipped |
| Browser accessibility | 18 unfiltered WCAG 2/2.1/2.2 axe route scans, 320px reflow, 200% text, reduced motion, keyboard, focus, and announcements passed |
| Browser artifact redaction | Passed; no retained Playwright files |
| `npm run test:coverage` | 981 passed with 109 environment skips; 46.06% statements, 36.10% branches, 40.73% functions, 46.94% lines |
| Dependency audit | Production-only and full trees: 0 vulnerabilities |
| Prometheus rules | `promtool check rules` passed, 18 rules |

One combined build invocation received host signal 143 after the web build
completed and while API typecheck was running. The standalone full build
immediately passed. An earlier production-bundle smoke run exposed the
intentionally fail-closed missing PMTiles build variable; the harness now
supplies a same-origin content-addressed test URL, and the focused 7-case plus
complete 97-case suites passed. These supersede the interrupted attempts.

## Roadmap acceptance evidence

| Acceptance area | Evidence and boundary |
| --- | --- |
| Managed signup and existing-account OAuth | [Phase 1](./buyer-ready-phase-1-2026-07-28.md) proves the managed-PDS adapter, safe error/identity handling, rate limit, and handoff into the existing OAuth/session path. Prior controlled external OAuth evidence remains valid; a fresh live managed-signup invite was not available and the credentialed Playwright case is explicitly skipped. |
| Versioned consent and 18+ eligibility | Durable PostgreSQL and production-bundle browser tests reject stale/incomplete policy state until all five current documents and the 18+ assertion are accepted. |
| Volunteer and organization ownership | [Phase 2](./buyer-ready-phase-2-2026-07-28.md), [Phase 3](./buyer-ready-phase-3-2026-07-28.md), and the production-bundle volunteer and organization journeys prove session-derived ownership, invitations, capabilities, stewardship, reconfirmation, discovery, and safe owner deactivation. |
| Verification, annual expiry, revocation, and appeal | [Phase 2](./buyer-ready-phase-2-2026-07-28.md), fresh PostgreSQL tests, and the browser verification journey prove private evidence, decisions, one-year expiry, renewal, revocation, appeal, audit, and projection withdrawal. |
| Exact public-resource address policy | Positive display requires current organization/resource verification, active stewardship, public provenance, explicit opt-in, and moderator approval. Forged, private, confidential, stale, and revoked cases fail closed in shared and PostgreSQL negative-contract tests. |
| Offers, matching, inbox, and outcomes | [Phase 3](./buyer-ready-phase-3-2026-07-28.md), durable service tests, and the two-context coordination browser journey prove advisory explainable matching, manual offers/acceptance, handoff, activity state, completion, and structured outcome feedback. |
| Exact-location peer exchange and absence | [Phase 4](./buyer-ready-phase-4-2026-07-28.md) and the production-bundle two-context WebRTC journey prove fresh mutual consent, authenticated peer exchange, stop/revoke paths, and no server fallback. The repository absence gate checks 42 durable schema/export/backup/log surfaces. |
| Real attachment scan/access/deletion | [Phase 5](./buyer-ready-phase-5-2026-07-28.md) and the repeated real MinIO/clamd gate prove private server-generated keys, content detection, image re-encoding, malware quarantine, actor-bound access, restart, retries, deletion, and deactivation cleanup. |
| In-app, email, and browser push | [Phase 6](./buyer-ready-phase-6-2026-07-28.md) proves atomic durable intent, deduplication, retry/dead-letter state, in-app controls, HTTPS email adapter, VAPID Web Push adapter, explicit opt-in, invalid-target cleanup, and private-payload exclusion. Email/VAPID network calls use intercepted transports; no protected live provider credentials are claimed. |
| Automated moderation, admin review, and maintenance | [Phase 7](./buyer-ready-phase-7-2026-07-28.md), PostgreSQL tests, and two moderator browser cases prove pre-publication fail-closed checks, privacy-safe queue/evidence, decisions, appeals, urgent intent, one-action quarantine, audited maintenance declaration/resume, and safe read-only state. |
| Synthetic/sourced/visitor separation | [Phase 8](./buyer-ready-phase-8-2026-07-28.md) proves deterministic replay, immutable origin/provenance, visitor preservation, reserved-key collision refusal, source non-participation disclosure, export labels, and visible production origin badges. |
| Export and deactivation | Fresh PostgreSQL suites cover consent/preferences, volunteer, organization, verification, exact-address, offers/connections/outcomes, attachments, notifications, moderation attribution, showcase protection, session revocation, and bounded retained exceptions. Exports exclude bodies, object keys, tokens, signed URLs, exact coordinates, and cross-subject state. |
| Chat placeholder/no production runtime | API route/advertised-contract checks reject production chat; production-bundle Chromium proves no history, form, initiation control, fixture fallback, or mutation. Structured offers, connections, inbox activity, and outcomes are the implemented coordination path. |

## Completion-definition review

| Definition | Finding |
| --- | --- |
| Every included charter capability has a real runtime path | Satisfied at durable/configured-runtime level |
| No included subsystem remains fixture or contract only | Satisfied; remaining fixture/contract rows in the current-state matrix are explicitly excluded expansion scope |
| Fixture chat unreachable and placeholder truthful | Satisfied |
| Authenticated and anonymous browser journeys pass against a production build | Satisfied for 96 local runnable cases against the built bundle; the separate credential-required live PDS repetition remains an external operational gap |
| Current-state and legal/product copy match observed behavior | Satisfied by current matrix, API contract map, public legal routes, evaluator guide, screenshots, and browser assertions |
| Fresh review records risk without implicit launch approval | Satisfied here and in the updated operational go/no-go |

## Remaining risk and operational NO-GO

The following were not converted into software claims or implicit exceptions:

- no fresh credentialed managed-signup/live-PDS repetition or recovery-email
  exercise;
- no protected live email/VAPID provider delivery, feedback webhook, or
  credential-rotation exercise;
- no owner-supplied independent WCAG 2.2/assistive-technology review;
- no formal legal, privacy, retention-exception, backup-deletion, or
  AT-repository-boundary approval;
- no named product, engineering, infrastructure, privacy,
  trust-and-safety, incident-command, or on-call acceptance;
- no protected GHCR/OIDC promotion, independent backup durability, production
  capacity certification, or human alert acknowledgment;
- no production malware-definition/credential operation, independent object
  backup/restore, or cross-network peer-location repetition.

The authoritative [alpha go/no-go](./phase-8/alpha-go-no-go.md) therefore
remains **NO-GO**. Patchwork must not accept pilot participants or public
traffic and must not be described as emergency dispatch, guaranteed
fulfillment, identity/safety certification, or an established participating
community service.
