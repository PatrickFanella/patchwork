# Phase 7 moderation + privacy hardening (P7.1-P7.4)

This document captures the Phase 7 implementation scope for roadmap issue #41.

## Modules

- Moderation queue domain: `packages/shared/src/moderation.ts`
- Anti-spam safety hardening: `packages/shared/src/messaging.ts`
- Privacy/redaction utilities: `packages/shared/src/privacy.ts`
- Ingestion log redaction integration: `packages/shared/src/firehose.ts`
- API anti-spam metrics route: `services/api/src/chat-service.ts`, `services/api/src/index.ts`
- Moderation worker queue/policy routes: `services/moderation-worker/src/moderation-service.ts`, `services/moderation-worker/src/index.ts`
- Regression/quality gates: `.github/workflows/ci.yml`, `docs/quality-gates.md`

## P7.1 moderation queue + policy actions

A moderation review queue now supports:

- queueing reported subjects with context metadata
- deterministic policy actions (`delist`, `suspend-visibility`, `restore-visibility`)
- appeal lifecycle states (`pending`, `under-review`, `upheld`, `rejected`)
- immutable action audit trail records with previous/next state snapshots

Read paths for moderation state are exposed through moderation-worker endpoints:

- `GET /moderation/queue`
- `GET /moderation/state`
- `GET /moderation/audit`

## P7.2 anti-spam controls

Chat safety controls now include:

- duplicate-message detection and blocking
- suspicious-pattern signaling when repeated incidents exceed threshold
- operational counters for evaluated/blocked/rate-limited/duplicate/flagged events

These counters are exposed through:

- `GET /chat/safety/metrics`

## P7.3 geoprivacy + minimal logging

Phase 7 reinforces privacy behavior by:

- enforcing minimum public precision for geo records during normalization
- redacting sensitive identifiers in ingestion diagnostic logs (DIDs, AT URIs)
- keeping diagnostic logging minimal and policy-driven

No public query path should emit exact source coordinates.

## P7.4 moderation/privacy regression and release gates

Regression suites cover:

- moderation queue + appeal transitions
- anti-spam duplicate and suspicious-pattern behavior
- geoprivacy/redaction behavior in utility and ingestion paths

CI now includes an explicit gate before full unit tests:

- `npm run test:phase7`

This gate must pass for merge readiness.
