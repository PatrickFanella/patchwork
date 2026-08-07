# Protected Pilot Readiness sprint

Date: 2026-08-07
Launch state at entry: **NO-GO**

## Objective

Convert the proven home-staging product into a repeatable protected-release and
operations package suitable for a fresh pilot decision. This sprint does not
authorize public traffic or participant recruitment and does not self-approve
independent professional gates.

## Scope constraints

- Preserve exact-person location boundaries, cookie-only browser auth, server-
  derived identity, authorization, CSRF, idempotency, retention, maintenance,
  and moderation fail-closed behavior.
- Keep the legacy group-coordination, reputation, native-mobile, multi-region,
  matching, and connector experimentation stubs. They remain excluded from
  production claims unless a later sprint explicitly promotes them.
- Chat remains bounded, server-readable text and must never be described as
  end-to-end encrypted.
- Never fabricate credentials, a second responder, alert acknowledgment,
  provider delivery, professional review, or legal approval.

## Definition of Ready

A story needs an actor, need, measurable outcome, preconditions, authorization,
data classification, normal and failure states, EN/ES and accessibility impact,
abuse/privacy/security analysis, rollback behavior, acceptance criteria, test
layers, operational evidence, dependencies, and explicit exclusions.

## Definition of Done

1. Every non-external criterion maps to an existing automated or operational
   evidence path in `docs/test-traceability-protected-pilot.json`.
2. Positive, denial, invalid-input, retry, restart, privacy, accessibility, and
   recovery cases pass where applicable.
3. Durable behavior is tested with PostgreSQL and after restart.
4. Production English and Spanish remain complete and state-preserving.
5. Logs, metrics, alerts, audit effects, retention, and forbidden side effects
   are asserted.
6. Full repository and production-bundle regression gates pass without hiding
   unexpected skips or rerunning flakes until green.
7. Evidence names the exact commit, digests, migrations, backup, rollback, test
   counts, skips, and remaining external gates.
8. The immutable deployed release passes post-deploy smoke checks.
9. External approvals stay `BLOCKED_EXTERNAL` until supplied by an accountable
   independent reviewer.
10. The final decision is explicitly `GO`, `CONDITIONAL GO`, or `NO-GO`.

## Stories and acceptance dimensions

The canonical criterion-level ledger is
[`docs/test-traceability-protected-pilot.json`](../../test-traceability-protected-pilot.json).
It is executable through `npm run test:operations`.

| Story | Outcome | Mandatory dimensions |
| --- | --- | --- |
| PPR-1 Protected artifacts | Only trusted immutable images can deploy | scan, signature, SBOM, provenance, prefix trust, digest/revision, rollback |
| PPR-2 Independent recovery | Host loss does not destroy the recovery path | checksum, encryption, attachments, readback, session invalidation, RPO/RTO |
| PPR-3 Identity lifecycle | Signup/login/recovery fail safely | forgery, replay, expiry, CSRF, revocation, EN/ES, keyboard, live credential gate |
| PPR-4 Two-participant coordination | Central journey works without fixtures | lifecycle, scheduling, groups, chat, block/report, restart, reconciliation, privacy |
| PPR-5 Incident response | Alerts receive human escalation and mitigation | ownership, acknowledgment, secondary, maintenance, rollback, redacted timeline |
| PPR-6 Accessible bilingual operation | Language/access needs do not block safe use | parity, focus, screen reader, reflow, zoom, motion, state preservation, independent review |
| PPR-7 Safe degradation | Dependency failures do not create unsafe state | fail closed, idempotency, stale events, redaction, soak, recovery |
| PPR-8 Go/no-go evidence | One release-bound decision record exists | test counts, skips, digests, backups, approvals, expiry, explicit decision |

## Test policy

- Fixture-only success does not prove a production criterion.
- Every mutation tests identity derivation, authorization, CSRF where relevant,
  idempotency, replay, cross-account denial, persistence, and deactivation.
- Every external adapter tests success, timeout, unavailable and malformed
  responses, safe errors, retry, and duplicate handling.
- Browser journeys run against the built production bundle and cover both
  locales unless content is intentionally locale-neutral.
- Accessibility combines automated axe with keyboard, focus, zoom/reflow,
  reduced-motion, and external assistive-technology review.
- Coverage is diagnostic. Criterion-level behavior, forbidden-side-effect
  assertions, and deployed evidence determine acceptance.
- Unexpected skips, flakes, leaked artifacts, mismatched revisions, unsigned
  images, missing attestations, stale backups, or failed restore checks block
  promotion.

## Phase sequence

1. Audit and scope lock.
2. Story and criterion traceability.
3. Protected release trust and attestations.
4. Independent database/private-object recovery mechanism.
5. Credentialed live exercises when protected inputs exist.
6. Alert acknowledgment, secondary escalation, and review packets.
7. Full quality, security, browser, migration, recovery, and capacity gates.
8. Focused commits, synchronization, immutable deployment, smoke checks, and a
   refreshed go/no-go decision.

External inputs may block a launch gate, but they do not permit fabricated
evidence or weaken the binding NO-GO.
