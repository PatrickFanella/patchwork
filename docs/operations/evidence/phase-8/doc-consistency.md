# Documentation consistency review

Review date: 2026-07-28

Scope: `README.md`, 81 Markdown files under `docs/`, runtime configuration,
package scripts, HTTP routes, migrations, Compose, and CI workflows.

## Issue list

| # | Severity | Documentation claim | Code/config evidence | Disposition |
| ---: | --- | --- | --- | --- |
| 1 | P1 | Matrix said moderation retention was incomplete | `migrations/003_retention_enforcement.sql`, `postgres-retention-service.ts` | Fixed in this pass |
| 2 | P1 | Traceability said production moderation was fixture-backed | `moderation-runtime.ts` requires PostgreSQL in production | Fixed |
| 3 | P1 | Matrix said browser accessibility cases could not execute | Current Playwright gate: 39 pass | Fixed |
| 4 | P1 | README implied Prometheus was deployed by this repository | Compose has no Prometheus service; only `/metrics` and rules exist | Fixed |
| 5 | P1 | README quick start ran only API migrations | Three migration runners exist in package scripts | Fixed |
| 6 | P1 | Incident runbook described log-derived alerts as current delivery | `monitoring/prometheus/patchwork-alerts.yml` has executable rules | Fixed |
| 7 | P1 | Staging environment lists example on-call addresses as if assigned | No named accepted owner exists in go/no-go evidence | Open; must be replaced during approval |
| 31 | P1 | Browser evidence assumed any service already listening on port 5173 was Patchwork | Playwright allowed server reuse and could attach to an unrelated development server | Fixed with strict dedicated port 41739 and server reuse disabled |
| 8 | P2 | README opening still calls the repository a prototype | Matrix says pre-alpha `NO-GO`, with substantial durable alpha paths | Accepted conservative wording |
| 9 | P2 | Historical implementation plan says “fully AT Protocol-native” | Matrix explicitly says no subsystem is production-ready | Historical plan; superseded |
| 10 | P2 | Full-app plan says core journeys are fully implemented | Expansion matrix freezes it and marks it historical | Superseded banner retained |
| 11 | P2 | Production issue plan says moderation production entrypoint is fixture-backed | Current runtime fails production without PostgreSQL | Historical plan; superseded |
| 12 | P2 | Production issue plan defines future production-ready conditions | Current authority is continuation roadmap and matrix | Historical plan; superseded |
| 13 | P2 | ADR 0003 introduction says runtime is fixture-heavy | ADR records decision-time context, not current status | Historical context retained |
| 14 | P2 | Earlier phase evidence records older migration counts | Current counts are 13/4/3 | Dated evidence retained; current reports corrected |
| 15 | P2 | Earlier Phase 7 immutable-delivery evidence recorded 836 tests | Current repository suite has 892 tests | Immutable-delivery evidence refreshed after NUC execution |
| 16 | P2 | Phase 7 staging-readiness records seven alert rules | Current rule file has eleven | Dated drill evidence retained |
| 17 | P2 | Legal changelog references `MODERATION_LOG_RETENTION_DAYS` | Runtime uses explicit seven-day migration and scheduler policy | Historical changelog retained; current policy corrected |
| 18 | P2 | README “Fallback dataset” label can imply runtime fallback | Production code forbids fixture mode and never silently falls back | Wording already says test/demo only |
| 19 | P2 | README root `db:migrate` script sounds universal | Root script invokes API migration only | Fixed in quick start; command list is explicit |
| 20 | P2 | Test traceability calls lifecycle UI fixture-oriented | Alpha shell now uses durable authenticated commands; some expansion UI remains fixture-only | Fixed in the capability matrix |
| 21 | P2 | Quality-review evidence says traceability maps old fixture architecture | Traceability has since been rewritten | Dated review evidence retained |
| 22 | P2 | Capacity envelope describes modeled budgets as operational guidance | No deployed staging load result exists | Fixed; targets, local evidence, and staging proof are separated |
| 23 | P2 | Progressive-delivery runbook discusses canary thresholds | Alpha deployment is single staging topology with no executed canary | Mechanism-only; external execution remains open |
| 24 | P3 | README requires Node >=20.19 while roadmap standardizes Node 22 | `package.json` supports >=20.19; Docker uses Node 22 | Valid compatibility difference |
| 25 | P3 | Historical phase documents use legacy component phase naming | Current roadmap supersedes phase sequencing | Retained for provenance |
| 26 | P3 | Some docs use “Spool/Quilt/Thimble,” others service directory names | Compose aliases deliberately preserve both names | Accepted terminology mapping |
| 27 | P3 | Dated evidence test counts differ from current report | Evidence is immutable by date | Current authority links added elsewhere |
| 28 | Pending evidence | Terms promise account deletion through Settings | Settings remains fixture-runtime in matrix | Must be reviewed by product/legal before any launch |
| 29 | Pending evidence | Privacy policy describes data access and deactivation rights in UI | Authenticated export and durable deactivation are implemented locally | Runtime fixed; formal policy approval and real staging exercise remain launch-blocking |
| 30 | Pending evidence | Staging host, DNS, registry, and OAuth docs describe intended resources | No authorized external inventory is available | Verify during staging or closure approval |
| 32 | P1 | Capacity documentation names three repeatable test files | None of the named test files exists | Fixed with tested `capacity:probe` and corrected runbook |
| 33 | P1 | Current docs said ingestion/tombstone integration was absent and production subscribed to every planned NSID | Durable projection/tombstone paths exist; alpha scope is aid-post only | Fixed with current reconciliation evidence and narrowed runtime subscription |
| 34 | P1 | Prepared closure inventory said no staging deployment or pushed continuation existed | NUC runs the signed four-digest release and local `main` matches `origin/main` | Fixed with a current non-destructive inventory |

## Review conclusion

Verdict: **Conditional pass** for repository handoff; **fail for launch**.

| Level | Count |
| --- | ---: |
| P0 blocker | 0 |
| P1 major | 11 |
| P2 minor/historical | 16 |
| P3 nit/accepted | 4 |
| Pending evidence | 3 |
| **Total** | **34** |

All eleven P1 documentation inconsistencies were fixed or converted to explicit
unassigned placeholders in this pass. Pending issues 28–30 still require human
or external evidence and are represented as `NO-GO` conditions; draft legal
documents are now conspicuously marked not in force. Historical evidence is
intentionally not rewritten because
its dated values describe what was actually observed then.

Change impact: README, matrix, traceability, incident documentation, closure
plan, final status report, and later indexer evidence changed. The subsequent
runtime reconciliation slices did not deploy, notify externally, or perform a
destructive external action.
