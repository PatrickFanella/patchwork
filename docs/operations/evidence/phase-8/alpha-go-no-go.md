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

## Evidence reviewed

| Area | Current evidence | Assessment |
| --- | --- | --- |
| AT record lifecycle | Phase 2 direct-PDS evidence plus the 2026-07-28 controlled two-account browser journey | Complete home-network OAuth/API/PDS/Jetstream/browser path proven |
| Durable private state | Phase 3 restart, concurrency, idempotency, audit, and moderation evidence | Local and PostgreSQL gates pass |
| HTTP security | Phase 4 method, auth, CSRF, stable-error, idempotency, and privacy evidence | Local gate passes |
| Live ingestion and discovery | Phase 5 cursor, reconnect, projection, tombstone, dead-letter, rebuild, query, and automatic lifecycle-reconciliation evidence plus controlled live aid and directory lifecycles | Home-network external gate passes; protected staging repetition remains |
| Web journey | Local browser evidence passes 50 Chromium cases; controlled two-account OAuth cases passed before and after immutable deployment, most recently in 13.6 seconds | Phase 6 and post-deploy browser gates satisfied |
| Staging topology and delivery | Four zero-HIGH/CRITICAL images were signed, published to the NUC loopback registry, deployed by exact digest, rolled back as a set, and promoted forward | Phase 7 technical home-staging gate satisfied; protected GHCR/OIDC execution remains absent |
| Recovery and alerting | NUC indexer-disconnect alert/recovery plus live PostgreSQL 17 backup and empty-target restore with measured RTO/RPO | Mechanisms pass; independent backup durability and human acknowledgment remain |
| Security | `npm audit --omit=dev --audit-level=high` is green; Trivy 0.59.1 reports zero HIGH/CRITICAL findings for all four deployed images; Cosign verifies every digest | Home-staging image gate green; signing key and registry share the host and have no transparency-log record |
| Data retention | API migration 0012 and moderation migration 003 drive hourly non-overlapping cleanup for all alpha-private state. Active moderation cases and sessions are preserved; failure/staleness metrics alert for both runtimes. | Formal privacy/backup-deletion approval and deployed scheduler observations remain incomplete |
| Data subject access and deactivation | Authenticated versioned export covers Patchwork-held alpha data without credentials or cross-subject projections. Durable deactivation removes Patchwork state, revokes login, sanitizes bounded retained exceptions, and suppresses future commands/projections. | Independent AT-repository deletion, controlled casework review, real staging exercise, and formal privacy approval remain incomplete |
| Accessibility | The 50-case Chromium gate passes, including eight zero-violation axe route scans and cross-route 320px reflow | No independent WCAG 2.2 or assistive-technology review |
| Performance | Executable local HTTP probe passed modeled alpha read targets over 1,000 PostgreSQL projections with zero errors | No sustained staging workload, write/ingestion/moderation load, or resource saturation measurement |
| Operations | Role-based RACI and incident procedures exist | No named humans have accepted staging on-call, product, engineering, or trust-and-safety ownership |

Current verification baseline:

- repository unit/contract suite: 892 tests;
- PostgreSQL/HTTP integration: 33 tests;
- indexer suite with PostgreSQL enabled: 50 tests;
- moderation suite with PostgreSQL enabled: 63 tests;
- direct service integration: 9 tests;
- Chromium: 50 local cases passed, 1 controlled external case passed separately;
- database-enabled coverage: 65.38% statements, 51.91% branches, 59.29%
  functions, 66.54% lines;
- API/indexer/moderation migrations replay cleanly at 13/4/3;
- build, typecheck, lint, artifact redaction, and high-severity dependency audit
  pass.

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
| `CAPACITY` | Staging load test records safe request, ingestion, queue, and database headroom | Engineering + Infrastructure | 2026-08-11 |
| `OWNERSHIP` | Named people accept product, engineering, infrastructure, privacy, trust-and-safety, and on-call responsibilities | Product | 2026-08-11 |

Any condition not completed by its date expires the review; it does not become
an implicit exception. A fresh go/no-go review must collect current evidence.

## Decision consequence

Keep all public deployment and recruitment disabled. Complete safe local work
and the authorized staging gates, then reassess. Do not begin an expansion
feature or pilot under this decision. If the organization cannot assign owners
and execute the staging gates, use the project-closure path instead of leaving
an ambiguous dormant service.
