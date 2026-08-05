# Patchwork alpha go/no-go review

Decision date: 2026-07-28 (America/Chicago)

Decision: **NO-GO**

Next review: **2026-08-11**, or earlier when every hard gate below has current
evidence.

Patchwork must not accept pilot participants or public traffic. The local alpha
implementation is materially stronger than the abandoned prototype. Phase 6
and the Phase 7 technical home-staging gate are now demonstrated, but the
human-review and pilot-authority gates are not. There are no exceptions to the
launch criteria in this decision.

## Feature-completion addendum — 2026-07-29

The buyer-ready web feature program completed its clean repository acceptance
at revision `6025cb2d`. This changes the software feature assessment, not the
launch decision. Every charter-included subsystem now has a durable or
externally integrated runtime path, the browser gate runs against the built
production bundle, and the feature-completion review is recorded in
[`buyer-ready-phase-9-feature-completion-2026-07-29.md`](../buyer-ready-phase-9-feature-completion-2026-07-29.md).

The independent and human-authority gates below were not supplied. The
decision remains **NO-GO**, public deployment and participant recruitment
remain prohibited, and no feature-completion result is launch approval.

## Product-gap sprint addendum — 2026-08-04

The post-roadmap sprint closed OAuth callback restoration, misleading deferred
navigation, reversible map-area interactions, and durable outcome-safety
escalation. A fresh zero-state database and production-bundle browser gate are
recorded in
[`buyer-ready-product-gap-sprint-2026-08-04.md`](../buyer-ready-product-gap-sprint-2026-08-04.md).
The dependency audit also identified and resolved a current Undici advisory
before acceptance was repeated. These results strengthen the software
assessment but do not satisfy the independent or human-authority gates. The
decision remains **NO-GO**.

## Evidence reviewed

| Area | Current evidence | Assessment |
| --- | --- | --- |
| AT record lifecycle | Phase 2 direct-PDS evidence plus the 2026-07-28 controlled two-account browser journey | Complete home-network OAuth/API/PDS/Jetstream/browser path proven |
| Durable private state | Phase 3 restart, concurrency, idempotency, audit, and moderation evidence | Local and PostgreSQL gates pass |
| HTTP security | Phase 4 method, auth, CSRF, stable-error, idempotency, and privacy evidence | Local gate passes |
| Live ingestion and discovery | Phase 5 cursor, reconnect, projection, tombstone, dead-letter, rebuild, query, and automatic lifecycle-reconciliation evidence plus controlled live aid and directory lifecycles | Home-network external gate passes; protected staging repetition remains |
| Web journey | The 2026-08-04 clean gate builds and serves the production bundle and passes 98 runnable Chromium cases; one credentialed live OAuth/PDS case is skipped locally. Earlier controlled two-account OAuth cases passed before and after prior immutable deployments. | Buyer-ready local feature gate and prior controlled external OAuth path pass; fresh credentialed callback/signup/PDS repetition remains external |
| Staging topology and delivery | Revision `43deb5e9` is the current four-image exact-digest release. Its images parse to zero HIGH/CRITICAL findings, verify with the retained local key, and passed migration/readiness/zero-restart/live-map/missing-session-callback checks after a validated backup. Revision `45e21906` is retained as the immediate rollback set; earlier evidence rolled a four-image set back and promoted it forward. | Technical home-staging gate satisfied; protected GHCR/OIDC execution remains absent |
| Recovery and alerting | NUC indexer-disconnect alert/recovery plus live PostgreSQL 17 backup and empty-target restore with measured RTO/RPO | Mechanisms pass; independent backup durability and human acknowledgment remain |
| Security | `npm audit --omit=dev --audit-level=high` is green; Trivy 0.59.1 reports zero HIGH/CRITICAL findings for all four deployed images; Cosign verifies every digest | Home-staging image gate green; signing key and registry share the host and have no transparency-log record |
| Data retention | API migration 0012 and moderation migration 003 drive hourly non-overlapping cleanup for all alpha-private state. Active moderation cases and sessions are preserved; failure/staleness metrics alert for both runtimes. The immutable NUC schedulers removed representative expired API and moderation rows on their next natural hourly pass with successful metrics, zero alerts, and zero restarts. | Formal privacy/backup-deletion, retained-exception, suppression-marker, and AT-repository-boundary approval remains incomplete |
| Data subject access and deactivation | Authenticated versioned export covers Patchwork-held alpha data without credentials or cross-subject projections. Durable deactivation removes Patchwork state, revokes login, sanitizes bounded retained exceptions, and suppresses future commands/projections. Six disposable workload users passed the real staging deactivation path and aggregate cleanup verification. | Independent AT-repository deletion, controlled human casework review, and formal privacy approval remain incomplete |
| Accessibility | The production-bundle Chromium gate passes 98 runnable cases, including eighteen zero-violation axe route scans, cross-route 320px reflow, 200% text sizing, and reduced-motion checks | No independent WCAG 2.2 or assistive-technology review |
| Buyer-ready runtime | Organizations/stewardship, verification/exact public addresses, offers/connections/outcomes, matching, private attachments, exact peer location, notifications, moderation/maintenance, showcase origin, export/deactivation, and the no-chat boundary pass clean local gates | Feature-complete locally; protected providers, independent reviews, and launch operations remain unapproved |
| Performance | A five-minute mixed immutable-staging run completed 12,000 reads at 40 aggregate RPS with zero errors and 85.574 ms worst p95, three real OAuth/PDS/Jetstream lifecycle journeys, three moderation resolutions, safe measured headroom, zero restart/error deltas, and clean recovery | Bounded NUC envelope proven; saturation, higher modeled targets, multi-replica behavior, and production sizing remain unproven |
| Operations | Role-based RACI and incident procedures exist | No named humans have accepted staging on-call, product, engineering, or trust-and-safety ownership |

Current verification baseline:

- repository unit/contract suite: web 254, API 314 runnable, indexer 35
  runnable, moderation 53 runnable, AT client 26, lexicons 5, and shared 322;
- fresh PostgreSQL suites: API 69, indexer 52, and moderation 71;
- direct web service integration: 8 tests;
- real MinIO/clamd attachment integration: 1 end-to-end case;
- production-bundle Chromium: 98 runnable cases passed and 1
  credential-required external PDS case skipped;
- diagnostic coverage: 46.39% statements, 36.41% branches, 41.14% functions,
  and 47.25% lines across 1,009 runnable tests;
- API/indexer/moderation migrations replay cleanly at 22/6/5;
- build, typecheck, lint, exact-location absence, artifact redaction,
  Prometheus rule validation, and production/full dependency audits pass.

These local results are necessary but do not substitute for external proof.

## Hard conditions for reconsideration

| Condition | Required proof | Accountable role | Due or expiry |
| --- | --- | --- | --- |
| `AT-BROWSER` | Satisfied 2026-07-28: two disposable users completed OAuth, create, ingest, discover, report, block, close, and delete with no fixture fallback | Engineering | Complete |
| `IMMUTABLE-STAGING` | Satisfied for NUC home staging 2026-07-28: four scanned and signed digests deployed without rebuild and passed deep readiness/browser acceptance. Protected GHCR/OIDC promotion remains a production hardening item. | Infrastructure | Complete for home staging |
| `ROLLBACK` | Satisfied 2026-07-28: staging returned to a signed prior-source four-digest manifest without a down migration, passed readiness, and promoted forward again | Infrastructure | Complete |
| `RECOVERY` | Satisfied 2026-07-28: a live staging backup restored into an empty database, invalidated sessions, preserved required state, and recorded 1-second RTO/22-second RPO | Infrastructure + Engineering | Complete |
| `ALERT-GAMEDAY` | Mechanism satisfied 2026-07-28: indexer disconnect fired through Alertmanager and recovered; human acknowledgment remains part of `OWNERSHIP` | Infrastructure + Incident Commander | Complete |
| `RETENTION` | Scheduled private-data expiry and deactivation are implemented and tested; backup, retained-exception, suppression-marker, and AT-repository-boundary policy is formally approved | Privacy + Engineering | 2026-08-11 |
| `ACCESSIBILITY` | Independent WCAG/assistive-technology review has no unresolved launch-blocking finding | Accessibility + Product | 2026-08-11 |
| `CAPACITY` | Satisfied for NUC home staging 2026-07-28: a five-minute mixed workload established a safe 40-RPS aggregate envelope with lifecycle, ingestion, moderation, resource, cleanup, and recovery evidence. Production sizing remains hardening work. | Engineering + Infrastructure | Complete for home staging |
| `OWNERSHIP` | Named people accept product, engineering, infrastructure, privacy, trust-and-safety, and on-call responsibilities | Product | 2026-08-11 |

Any condition not completed by its date expires the review; it does not become
an implicit exception. A fresh go/no-go review must collect current evidence.

## Decision consequence

Keep all public deployment and recruitment disabled. Complete safe local work
and the authorized staging gates, then reassess. Do not begin an expansion
feature or pilot under this decision. If the organization cannot assign owners
and execute the staging gates, use the project-closure path instead of leaving
an ambiguous dormant service.
