# Patchwork external-gate audit

Audit date: 2026-07-11 (America/Chicago)

Result: **all locally feasible alpha-critical implementation is complete; 15
roadmap checklist items remain unproven because their required external state
or human authorization is absent**.

This audit does not convert missing evidence into completion. It verifies the
current prerequisite surface without printing secret values, starting remote
services, publishing artifacts, changing DNS, or touching unrelated
home-network workloads.

## Requirement audit

| Remaining gate | Local mechanism and evidence | Missing authoritative proof | Current prerequisite state |
| --- | --- | --- | --- |
| Phase 6 real two-account browser journey (3 items) | Executable Playwright journey covers OAuth-authenticated create, live discovery, private workflow transition and public-status reconciliation, report, block, close, delete, and redaction assertions. Local Chromium gate passes with this one case skipped. | One successful run against PostgreSQL, live ingestion, and two disposable PDS/OAuth accounts, plus redacted artifacts. | All seven `PATCHWORK_E2E_*`/redaction inputs are unset; no local Patchwork or dsa-proto PDS container is running. |
| Phase 7 immutable publication/deployment (3 items) | Protected workflow builds four images once, scans, pushes, resolves digests, keyless-signs, deploys exact digests, migrates, waits for readiness, runs the browser gate, and invokes four-image rollback on failure. Local workflow, script, Compose, build, audit, and contract gates pass. | Registry push/signature records, protected-environment deployment logs, exact four-digest manifest, staging readiness, and post-deploy browser result. | GitHub CLI's configured token is invalid; staging host/user/path variables are unset; staging environment files and current/previous digest manifests are absent. |
| Phase 7 staging recovery/alert game days (6 items) | Isolated PostgreSQL restore proved empty-target enforcement, session invalidation, state recovery, and local RTO/RPO measurement. Eleven Prometheus rules validate and incident runbooks exist. | Restore of an actual staging backup, delivered/acknowledged alerts, indexer-disconnect and database-restore drills, operator decisions, timestamps, and follow-up fixes. | No authorized staging host, database, backup, alert receiver, or named incident operator is configured locally. |
| Phase 8 pilot or closure decision (3 items) | `NO-GO` review, expansion freeze, pilot requirements, and a complete closure plan are committed. No Patchwork container is running. | Written product, engineering, trust-and-safety, privacy/legal-hold, and operator approval for either a bounded pilot or closure execution. | Approvers remain unassigned. The local Patchwork PostgreSQL volume still exists and is deliberately not deleted without approval. |

## Current local authority boundary

- Running Docker services belong to Roberts Rules and Action Network. They are
  unrelated and were not changed.
- `patchwork_patchwork-postgres-data` remains for test/development data; no
  deletion authority was inferred.
- No registry publication, push, staging deploy, DNS change, OAuth-account
  creation, alert delivery, or external contact was performed.
- `.codex/` remains user-owned and untouched.

## Unblocking sequence

1. Provide an authorized staging host, protected registry/environment access,
   valid GitHub authentication, pinned SSH identity, and the staging secret
   file through the documented secret process.
2. Provide two disposable PDS/OAuth accounts and redaction terms through secure
   runtime inputs; never commit their storage state or credentials.
3. Execute immutable deployment, the real browser journey, rollback, staging
   restore, and both alert game days, preserving only redacted evidence.
4. Obtain formal retention/accessibility/capacity/ownership review and record a
   fresh go/no-go decision.
5. If those inputs will not be supplied, approve the prepared closure plan and
   name its operator; do not infer permission to destroy data or remote state.

Until one of those paths is authorized, the correct decision remains `NO-GO`.
