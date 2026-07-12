# Patchwork alpha go/no-go review

Decision date: 2026-07-11 (America/Chicago)

Decision: **NO-GO**

Next review: **2026-07-25**, or earlier when every hard gate below has current
evidence.

Patchwork must not accept pilot participants or public traffic. The local alpha
implementation is materially stronger than the abandoned prototype, but Phase
6 and Phase 7 external exit gates have not been demonstrated. There are no
exceptions to the launch criteria in this decision.

## Evidence reviewed

| Area | Current evidence | Assessment |
| --- | --- | --- |
| AT record lifecycle | Phase 2 redacted two-account direct-PDS CRUD and ownership evidence | Direct protocol path proven; complete browser/API path not proven |
| Durable private state | Phase 3 restart, concurrency, idempotency, audit, and moderation evidence | Local and PostgreSQL gates pass |
| HTTP security | Phase 4 method, auth, CSRF, stable-error, idempotency, and privacy evidence | Local gate passes |
| Live ingestion and discovery | Phase 5 cursor, reconnect, projection, tombstone, dead-letter, rebuild, query, and automatic lifecycle-reconciliation evidence | Controlled live staging lifecycle still absent |
| Web journey | Local browser evidence passes 49 Chromium cases, including private-workflow/public-AT sync recovery; the real two-account case includes that workflow step but is skipped without authorized state | Mandatory real OAuth journey absent |
| Staging topology and delivery | Phase 7 topology and digest-deployment mechanism evidence | No signed registry digest or staging deployment/rollback run |
| Recovery and alerting | Phase 7 isolated PostgreSQL 16 restore and eleven validated alert rules | No staging restore, notification delivery, or incident exercise |
| Security | `npm audit --omit=dev --audit-level=high`: zero vulnerabilities on 2026-07-11; delivery workflow is configured to reject high/critical Trivy findings | Dependency gate green; deployed-image scan has not run |
| Data retention | API migration 0012 and moderation migration 003 drive hourly non-overlapping cleanup for all alpha-private state. Active moderation cases and sessions are preserved; failure/staleness metrics alert for both runtimes. | Formal privacy/backup-deletion approval and deployed scheduler observations remain incomplete |
| Data subject access and deactivation | Authenticated versioned export covers Patchwork-held alpha data without credentials or cross-subject projections. Durable deactivation removes Patchwork state, revokes login, sanitizes bounded retained exceptions, and suppresses future commands/projections. | Independent AT-repository deletion, controlled casework review, real staging exercise, and formal privacy approval remain incomplete |
| Accessibility | The 49-case Chromium gate passes, including eight zero-violation axe route scans and cross-route 320px reflow | No independent WCAG 2.2 or assistive-technology review |
| Performance | Executable local HTTP probe passed modeled alpha read targets over 1,000 PostgreSQL projections with zero errors | No sustained staging workload, write/ingestion/moderation load, or resource saturation measurement |
| Operations | Role-based RACI and incident procedures exist | No named humans have accepted staging on-call, product, engineering, or trust-and-safety ownership |

Current verification baseline:

- database-enabled repository suite: 872 tests;
- PostgreSQL/HTTP integration: 32 tests;
- indexer PostgreSQL projection/reconciliation: 14 tests;
- direct service integration: 9 tests;
- Chromium: 49 passed, 1 externally gated case skipped;
- database-enabled coverage: 65.28% statements, 51.82% branches, 59.11%
  functions, 66.44% lines;
- API/indexer/moderation migrations replay cleanly at 13/3/3;
- build, typecheck, lint, artifact redaction, and high-severity dependency audit
  pass.

These local results are necessary but do not substitute for external proof.

## Hard conditions for reconsideration

| Condition | Required proof | Accountable role | Due or expiry |
| --- | --- | --- | --- |
| `AT-BROWSER` | Two disposable users complete OAuth, create, ingest, discover, report, block, close, and delete with no fixture fallback | Engineering | 2026-07-25 |
| `IMMUTABLE-STAGING` | Four scanned and signed digests deploy through the protected workflow and pass deep readiness | Infrastructure | 2026-07-25 |
| `ROLLBACK` | Deployed staging returns to the prior four-digest manifest without incompatible down migration | Infrastructure | 2026-07-25 |
| `RECOVERY` | A staging backup restores into an empty database, invalidates sessions, preserves required state, and meets measured RTO/RPO | Infrastructure + Engineering | 2026-07-25 |
| `ALERT-GAMEDAY` | Indexer disconnect and database-loss drills deliver, acknowledge, and resolve actionable alerts | Infrastructure + Incident Commander | 2026-07-25 |
| `RETENTION` | Scheduled private-data expiry and deactivation are implemented and tested; backup, retained-exception, suppression-marker, and AT-repository-boundary policy is formally approved | Privacy + Engineering | 2026-07-25 |
| `ACCESSIBILITY` | Independent WCAG/assistive-technology review has no unresolved launch-blocking finding | Accessibility + Product | 2026-07-25 |
| `CAPACITY` | Staging load test records safe request, ingestion, queue, and database headroom | Engineering + Infrastructure | 2026-07-25 |
| `OWNERSHIP` | Named people accept product, engineering, infrastructure, privacy, trust-and-safety, and on-call responsibilities | Product | 2026-07-25 |

Any condition not completed by its date expires the review; it does not become
an implicit exception. A fresh go/no-go review must collect current evidence.

## Decision consequence

Keep all public deployment and recruitment disabled. Complete safe local work
and the authorized staging gates, then reassess. Do not begin an expansion
feature or pilot under this decision. If the organization cannot assign owners
and execute the staging gates, use the project-closure path instead of leaving
an ambiguous dormant service.
