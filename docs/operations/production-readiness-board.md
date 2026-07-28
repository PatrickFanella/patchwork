# Historical production-readiness board

This file preserves the issue and milestone routing used by the March 2026 roadmap. Its former target dates and `Open` statuses were planning metadata, not reliable descriptions of runtime maturity.

Current authority:

- Runtime maturity: `docs/architecture/current-state-matrix.md`
- Continuation phases and exit gates: `docs/superpowers/plans/2026-07-10-patchwork-continuation-roadmap.md`
- Test coverage: `docs/test-traceability.md`
- Current launch decision: `docs/operations/evidence/phase-8/alpha-go-no-go.md`
- Final continuation snapshot: `docs/operations/evidence/phase-8/final-continuation-report.md`
- Approval-gated closure plan: `docs/operations/evidence/phase-8/project-closure.md`

## Current decision

The refreshed 2026-07-28 review records **NO-GO**. Local implementation and verification
continue, but public deployment and pilot recruitment remain prohibited until
immutable staging, rollback, restore, alert-game-day, retention, accessibility,
capacity, and ownership gates have current evidence. The real two-account
browser gate is complete.

An issue being represented by code or tests does not mean its subsystem is externally integrated, durable, or production-ready. Use the maturity matrix for that determination.

## Historical tracks and issues

| Historical track | Issues | Current interpretation |
| --- | --- | --- |
| Program governance | #94, #95 | Historical planning artifacts; Phase 1 of the continuation roadmap replaces their status model. |
| Runtime completeness | #96, #97, #98, #99 | Some contracts, guards, checkpoints, and tests landed; durable moderation, live ingestion, and real integration remain continuation work. |
| Security and privacy | #100, #101, #102, #103 | The authenticated HTTP perimeter, privacy redaction, and scheduled API/moderation retention are implemented locally. Formal privacy approval and deployed scheduler evidence remain incomplete. |
| Reliability and observability | #104, #105, #106, #107 | Metrics and runbooks exist; current real staging alert, restore, rollback, and game-day evidence does not. |
| Release engineering | #108, #109, #110, #111 | Image-build and rollout models exist; the workflow does not currently publish and deploy a verified staging release. |
| Trust, safety, and launch | #112, #113, #114, #115 | Console models, policies, and documents exist; durable casework and pilot/GA evidence do not. |
| Core lifecycle and account experience | #116, #117, #118, #119, #120, #121, #122, #123 | Rich in-memory services and UX models exist; real AT identity and durable cross-service journeys do not. |
| Collaboration and trust expansion | #124, #125, #126, #127, #128, #129, #130, #131, #132 | Notifications, scheduling, groups, reputation, offline sync, feedback, verification, and matching are primarily tested models or fixture services. |
| Global and platform expansion | #133, #134, #135, #136, #137, #138 | i18n and accessibility foundations exist; mobile, multi-region, analytics, and integrations are not production runtime capabilities. |
| Parallel-wave coordination | #139 | Historical dependency and lane plan represented by `wave-0.md` through `wave-5.md`. |

## Historical milestone sequence

The former board used this sequence. It is retained only to decode issue references in commits and documentation:

1. M0 — Foundation and governance
2. M1 — Runtime durability
3. M2 — Core product lifecycle
4. M3 — Account and privacy
5. M4 — Global UX
6. M5 — Trust and verification

The active sequence is now the eight-phase continuation roadmap. New work must cite a continuation phase and task rather than inferring readiness from an old milestone or wave number.

## Historical helper scripts

`docs/operations/milestone-setup.sh` and `docs/operations/link-issues.sh` target the former GitHub milestone structure. Do not run them as part of continuation work unless they are first revised to match the authoritative roadmap.
