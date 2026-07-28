# Patchwork external-gate audit

Audit date: 2026-07-28 (America/Chicago)

Result: **the Phase 6 browser and Phase 7 recovery/alerting gates are complete; 6
roadmap checklist items remain unproven because their required external state
or human authorization is absent**.

This audit does not convert missing evidence into completion. It verifies the
current prerequisite surface without printing secret values, publishing
registry artifacts, changing DNS, or touching unrelated home-network workloads.

## Newly completed external gate

The Phase 6 real two-account browser journey passed on the NUC-hosted runtime.
Two disposable PDS accounts completed OAuth, create, live Jetstream ingestion,
second-session discovery, report, block, lifecycle resolve, public close
reconciliation, and delete. Exact coordinates, the private report marker, token
names, URLs, DOM text, and captured JSON passed the privacy assertions. Cleanup
left zero disposable projections, sessions, OAuth state, or workflows; the
retained safety report was redacted according to policy.

## Requirement audit

| Remaining gate | Local mechanism and evidence | Missing authoritative proof | Current prerequisite state |
| --- | --- | --- | --- |
| Phase 7 immutable publication/deployment (3 items) | Protected workflow builds four images once, scans, pushes, resolves digests, keyless-signs, deploys exact digests, migrates, waits for readiness, runs the browser gate, and invokes four-image rollback on failure. Local workflow, script, Compose, build, audit, and contract gates pass. | Registry push/signature records, protected-environment deployment logs, exact four-digest manifest, staging readiness, and post-deploy browser result. | GitHub CLI's configured token is invalid; staging host/user/path variables are unset; staging environment files and current/previous digest manifests are absent. |
| Phase 8 pilot or closure decision (3 items) | `NO-GO` review, expansion freeze, pilot requirements, and a complete closure plan are committed. The NUC runtime remains a controlled pre-pilot environment, not an approved public launch. | Written product, engineering, trust-and-safety, privacy/legal-hold, and operator approval for either a bounded pilot or closure execution. | Approvers remain unassigned. Patchwork state and services are deliberately not destroyed or opened to a pilot without approval. |

## Current local authority boundary

- The home NUC now runs Patchwork's PostgreSQL, API, web, indexer, moderation,
  and isolated local Jetstream services alongside unrelated workloads.
- The controlled exercise touched only Patchwork and its disposable PDS
  accounts; unrelated services were not changed.
- No registry publication, protected staging deploy, DNS change,
  OAuth-account persistence, or external contact was performed. The scoped
  disconnect alert used the existing `ntfy` receiver.
- `.codex/` remains user-owned and untouched.

## Unblocking sequence

1. Provide protected registry/environment access, valid GitHub
   authentication, a pinned SSH identity, and the staging secret-file routing
   needed by the workflow. The NUC itself is already the authorized
   home-network staging host.
2. Execute immutable signed-digest deployment and four-image rollback,
   preserving only redacted evidence.
3. Obtain formal retention/accessibility/capacity/ownership review and record a
   fresh go/no-go decision.
4. If those inputs will not be supplied, approve the prepared closure plan and
   name its operator; do not infer permission to destroy data or remote state.

Until one of those paths is authorized, the correct decision remains `NO-GO`.
