# Patchwork external-gate audit

Audit date: 2026-07-28 (America/Chicago)

Result: **the Phase 6 browser and all Phase 7 home-staging technical gates are
complete; 3 roadmap checklist items remain because their required human
authorization is absent**.

This audit does not convert missing evidence into completion. It verifies the
current prerequisite surface without printing secret values, changing DNS, or
touching unrelated home-network workloads.

## Newly completed external gates

The Phase 6 real two-account browser journey passed on the NUC-hosted runtime.
Two disposable PDS accounts completed OAuth, create, live Jetstream ingestion,
second-session discovery, report, block, lifecycle resolve, public close
reconciliation, and delete. Exact coordinates, the private report marker, token
names, URLs, DOM text, and captured JSON passed the privacy assertions. Cleanup
left zero disposable projections, sessions, OAuth state, or workflows; the
retained safety report was redacted according to policy.

Four hardened runtime images were then built from `55b337e`, scanned at zero
HIGH/CRITICAL findings, signed with a scoped Cosign key, published to the NUC
loopback registry, and deployed by exact digest with no rebuild. Migrations,
deep readiness, map artifact checks, public health, Prometheus targets, and a
13.6-second repeat of the two-account browser journey passed. A signed
prior-source four-digest manifest rolled back without a down migration and the
scanned release promoted forward again.

## Requirement audit

| Remaining gate | Local mechanism and evidence | Missing authoritative proof | Current prerequisite state |
| --- | --- | --- | --- |
| Phase 8 pilot or closure decision (3 items) | `NO-GO` review, expansion freeze, pilot requirements, and a complete closure plan are committed. The NUC runtime remains a controlled pre-pilot environment, not an approved public launch. | Written product, engineering, trust-and-safety, privacy/legal-hold, and operator approval for either a bounded pilot or closure execution. | Approvers remain unassigned. Patchwork state and services are deliberately not destroyed or opened to a pilot without approval. |

## Current local authority boundary

- The home NUC now runs Patchwork's PostgreSQL, API, web, indexer, moderation,
  and isolated local Jetstream services alongside unrelated workloads.
- The controlled exercise touched only Patchwork and its disposable PDS
  accounts; unrelated services were not changed.
- The NUC loopback registry now retains signed current/rollback artifacts and
  the host retains restricted manifests. No DNS change, persistent disposable
  OAuth account, or external contact was created. The scoped disconnect alert
  used the existing `ntfy` receiver.
- `.codex/` remains user-owned and untouched.

## Unblocking sequence

1. Treat protected GHCR/OIDC promotion, independent backup/signing durability,
   and sustained capacity as production hardening; do not erase the completed
   NUC proof.
2. Obtain formal retention/accessibility/capacity/ownership review and record a
   fresh go/no-go decision.
3. If those inputs will not be supplied, approve the prepared closure plan and
   name its operator; do not infer permission to destroy data or remote state.

Until one of those paths is authorized, the correct decision remains `NO-GO`.
