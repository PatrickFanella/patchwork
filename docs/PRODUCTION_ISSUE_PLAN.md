# Patchwork MVP → Full Production Issue Plan

This plan translates current repository state into an executable GitHub backlog.

## Current baseline (validated in-repo)

- Strong CI quality gate exists (`.github/workflows/ci.yml`) including lint/typecheck/unit/phase7/phase8/browser-e2e/build.
- Core product phases (identity, ingestion/query, chat routing, directory/onboarding, moderation/privacy) are documented and covered by deterministic tests.
- Runtime observability primitives exist (`/health`, `/metrics` on API/Indexer/Moderation worker).
- Dockerized deploy path exists, but is currently single-environment and single-host oriented (`docker-compose.yml`, `Makefile`).
- Production runtime still includes fixture-backed internals in critical paths (notably indexer + moderation-worker service entrypoints).

---

## Milestone sequence

1. **M0 — Production Program Setup** (Week 1)
2. **M1 — Runtime Completion** (Weeks 1-3)
3. **M2 — Security + Compliance Baseline** (Weeks 2-4)
4. **M3 — Reliability + Observability + DR** (Weeks 3-5)
5. **M4 — Release Engineering + Environment Promotion** (Weeks 4-6)
6. **M5 — Pilot + GA Readiness** (Weeks 6-8)

---

## Epic A: Program and governance

### Issue A1 — Create production readiness board and milestone map

- **Labels**: `epic`, `ops`, `program-management`
- **DoD**:
  - GitHub milestones `M0`..`M5` created.
  - All issues in this document created and linked to a parent tracking issue.
  - Owners + due dates assigned.

### Issue A2 — Define RACI for product, infra, moderation, incident command

- **Labels**: `ops`, `governance`, `trust-safety`
- **DoD**:
  - RACI matrix committed under `docs/operations/raci.md`.
  - On-call escalation path and backup approvers documented.

---

## Epic B: Runtime completeness (remove MVP fixture dependencies)

### Issue B1 — Replace indexer fixture pipeline with persistent ingestion runtime

- **Labels**: `backend`, `indexer`, `production-blocker`
- **Depends on**: A1
- **DoD**:
  - `services/indexer/src/index.ts` no longer boots fixture-only pipeline in production mode.
  - Checkpoint persistence survives restart.
  - Replay from checkpoint validated by integration test.

### Issue B2 — Replace moderation fixture service with durable queue/state backend

- **Labels**: `backend`, `moderation-worker`, `production-blocker`
- **Depends on**: A1
- **DoD**:
  - Moderation queue/audit state is durable across process restarts.
  - Policy apply operations are idempotent.
  - Queue latency + error metrics emitted.

### Issue B3 — Enforce strict production datasource modes and startup guards

- **Labels**: `backend`, `api`, `hardening`
- **Depends on**: B1, B2
- **DoD**:
  - Production boot fails fast if fixture mode is enabled.
  - Required env vars validated at startup with actionable errors.
  - Health endpoint reflects degraded/ready states (not only static `ok`).

### Issue B4 — End-to-end contract path against production-like dependencies

- **Labels**: `testing`, `integration`, `production-blocker`
- **Depends on**: B1, B2, B3
- **DoD**:
  - New CI job runs phase8-style flow against persistent backends (not fixture-only).
  - Flake rate < 2% over 20 consecutive runs.

---

## Epic C: Security and privacy baseline

### Issue C1 — Secrets management hardening

- **Labels**: `security`, `ops`, `production-blocker`
- **Depends on**: A1
- **DoD**:
  - No default credentials in production manifests.
  - Secrets sourced from a managed secret store or deployment secret injection.
  - Secret rotation runbook documented and tested.

### Issue C2 — Supply-chain and container security gates in CI

- **Labels**: `security`, `ci`
- **Depends on**: A1
- **DoD**:
  - Dependency vulnerability scan enabled on PRs.
  - Container image scan enabled for release builds.
  - Failing policy threshold blocks merge/release.

### Issue C3 — API perimeter hardening (rate limits, CORS, abuse controls)

- **Labels**: `security`, `api`, `trust-safety`
- **Depends on**: B3
- **DoD**:
  - Endpoint-level rate limits implemented for chat/posting/query abuse vectors.
  - CORS and origin validation are environment-specific and locked down.
  - Abuse events are auditable and alertable.

### Issue C4 — Data retention + deletion policy implementation

- **Labels**: `privacy`, `compliance`, `backend`
- **Depends on**: B2
- **DoD**:
  - Retention policy codified per table/log stream.
  - Verified delete/redaction workflow for moderation and diagnostic logs.
  - Policy documented in `docs/privacy/retention-and-deletion.md`.

---

## Epic D: Reliability, observability, and operations

### Issue D1 — Centralized metrics dashboards and SLI definitions

- **Labels**: `sre`, `observability`
- **Depends on**: B1, B2
- **DoD**:
  - Dashboard covers API latency/error, indexer lag, moderation queue depth, DB health.
  - SLI definitions committed in `docs/operations/sli-slo.md`.

### Issue D2 — Alerting policy tied to SLO burn + critical queue/dependency failures

- **Labels**: `sre`, `alerting`
- **Depends on**: D1
- **DoD**:
  - Paging alerts for SLO burn, ingestion halted, moderation backlog, DB unavailability.
  - Alert routing tested end-to-end.

### Issue D3 — Backup, restore, and disaster recovery drills

- **Labels**: `sre`, `data`, `production-blocker`
- **Depends on**: B1, B2
- **DoD**:
  - Automated DB backups with retention policy.
  - Restore drill performed and timed (RTO/RPO recorded).
  - DR runbook committed and reviewed.

### Issue D4 — Incident response runbook + game day

- **Labels**: `sre`, `ops`, `trust-safety`
- **Depends on**: D2, D3
- **DoD**:
  - Incident severity matrix + communication template published.
  - At least one game day completed with retro items tracked.

---

## Epic E: Release engineering and environment promotion

### Issue E1 — Introduce staging environment parity with production

- **Labels**: `infra`, `release`, `production-blocker`
- **Depends on**: C1, D1
- **DoD**:
  - Separate staging stack with same topology as production.
  - Automated deployment from `main` to staging.
  - Smoke tests required before production promotion.

### Issue E2 — Immutable image versioning + rollback strategy

- **Labels**: `release`, `ci-cd`, `infra`
- **Depends on**: E1
- **DoD**:
  - Every release uses immutable image tags.
  - One-command rollback documented and validated.
  - DB migration rollback policy documented.

### Issue E3 — Progressive delivery (canary or weighted rollout)

- **Labels**: `release`, `sre`
- **Depends on**: E2, D2
- **DoD**:
  - Canary rollout path implemented.
  - Automatic rollback on error budget burn.

### Issue E4 — Performance and scale validation

- **Labels**: `performance`, `testing`, `production-blocker`
- **Depends on**: B4, D1
- **DoD**:
  - Load test profiles for feed/map/chat/moderation paths.
  - Capacity limits documented with safe operating envelope.
  - p95 latency and throughput targets met in staging.

---

## Epic F: Trust-safety operations and launch readiness

### Issue F1 — Moderator operations console MVP and SOPs

- **Labels**: `trust-safety`, `operations`, `frontend`
- **Depends on**: B2
- **DoD**:
  - Moderators can triage queue, apply policy, and view audit in a secured UI/workflow.
  - SOPs for appeal handling and escalation documented.

### Issue F2 — Legal/Policy readiness pack (ToS, Privacy, Community Guidelines)

- **Labels**: `compliance`, `legal`, `trust-safety`
- **Depends on**: C4
- **DoD**:
  - Public policy pages published and linked in web app.
  - Versioning/changelog process for policy updates defined.

### Issue F3 — Pilot rollout and go/no-go checklist

- **Labels**: `launch`, `program-management`, `production-blocker`
- **Depends on**: E4, F1, F2, D4
- **DoD**:
  - Region/cohort pilot completed with success metrics.
  - Go/no-go checklist approved by engineering + operations + trust-safety.

### Issue F4 — General availability release

- **Labels**: `launch`, `ga`
- **Depends on**: F3
- **DoD**:
  - Production release completed.
  - 7-day hypercare with daily incident/health review complete.

---

## Parent tracking issue template

Use one parent issue titled:

`[Production] MVP to GA Readiness Program`

Body checklist should include all issues above grouped by Epic and Milestone.

---

## Exit criteria for “full production”

Patchwork is considered production-ready when all conditions below are true:

1. No fixture-only runtime dependencies in production paths.
2. Security controls (secrets, vuln scanning, perimeter hardening) enforced in CI/CD.
3. SLOs, alerts, backup/restore, and incident runbooks are active and tested.
4. Staging→production promotion and rollback are reliable.
5. Trust-safety operations + legal/privacy policies are live.
6. Pilot success criteria met and GA checklist approved.
