# Buyer-ready web gap assessment

Assessment date: 2026-07-28

Target:
[`buyer-ready-web-charter.md`](./buyer-ready-web-charter.md)

Current-state authority:
[`current-state-matrix.md`](../architecture/current-state-matrix.md)

## Executive assessment

Patchwork's narrow alpha core is substantially implemented: AT OAuth,
aid/directory record operations, PostgreSQL projections, lifecycle, blocks,
reports, moderation persistence, secure HTTP commands, account export and
deactivation, live ingestion, and the main web journey all have real runtime
paths.

The buyer-ready target is not a cosmetic finish. Six connected product areas
remain incomplete:

1. open managed-account registration and versioned consent;
2. durable volunteer, organization, verification, and appeal workflows;
3. durable matching, offers, inbox, and connection state;
4. non-persistent exact-location exchange;
5. durable scanned attachment handling;
6. durable notification delivery and operator-facing moderation UX.

Realistic synthetic data and buyer-ready presentation are additional
cross-cutting deliverables. Existing fixture services and domain contracts
provide useful specifications, but they are not accepted runtime
implementations.

## Capability comparison

| Capability | Current state | Buyer-ready target | Gap |
| --- | --- | --- | --- |
| Anonymous map/feed/resource discovery | Externally integrated through PostgreSQL projections | Searchable/filterable anonymous US discovery with synthetic labeling | Extend filters and origin metadata; retain current production path |
| Existing AT account login | Externally integrated OAuth and durable encrypted session stores | Retain current flow | Polish onboarding/recovery and add policy consent |
| Managed AT account creation | PDS signup contracts and partial service scaffolding exist | Permanent user-owned managed AT account creation followed by OAuth | Complete abuse-safe signup, verification, consent, recovery, and E2E |
| Aid requests and lifecycle | Externally integrated | Retain, add expiry/renewal, offers, attachments, notifications, and outcome feedback | Extend durable workflow without weakening PDS authority |
| Directory resources | Externally integrated CRUD and projection | Add stewardship, reconfirmation, verification, provenance, and approved exact public addresses | Add durable partner/approval state and directory-only location exception |
| Volunteer profiles | Fixture runtime with AT lexicon and onboarding logic | Durable owner-controlled profiles with no-permanent-address support | Add official client CRUD, ingestion/projection, private fields, API, and UI |
| Organizations | Fixture runtime with example identities | Durable organizations, memberships, resource stewardship, and admin roles | Add schemas, authenticated membership/capability boundaries, UI, and audit |
| Verification and appeals | Fixture runtime and contracts | Durable organization/resource verification, annual expiry, revocation, appeal, and moderator review | Add private evidence storage, jobs, endpoints, notifications, and admin UI |
| Matching | Fixture runtime/contracts | Explainable suggestions using safe public and private inputs; never auto-assign | Add durable sources, endpoint, UI, block/safety checks, and E2E |
| Offers and connection acceptance | Lifecycle primitives exist; no complete visitor journey | Durable offer/accept/decline/expiry with explicit consent | Add connection repository, authorization, UI, audit, and notifications |
| Exact personal location | Prior ADR permits bounded encrypted persistence; no complete browser flow | Authenticated, mutually consented, WebRTC-only exchange with no persistence | Replace target policy, add signaling/session authorization and absence tests |
| Exact public-resource location | Current clients enforce at least 1 km for all public directory coordinates | Moderator-approved exact address for verified public resources only | Extend directory schema/projection and quarantine unapproved precision |
| Attachments | Fixture metadata and simulated scan | Durable object storage, real scanning, transformations, signed access, deletion | Build complete upload/scan/access/retention path |
| Notifications | In-memory contracts; not wired at API startup | Durable in-app/email and opt-in browser push | Add outbox, workers, provider adapters, preferences, retries, and UI |
| Inbox | Process-local aggregation | Durable authenticated activity center | Define event sources/read state and integrate lifecycle/verification/moderation |
| Moderation persistence | Durable internal worker and API safety commands | Automated pre-publication checks plus operator web console | Add intake gate, classification adapters, quarantine UX, appeals, shutdown control |
| Synthetic data | Deterministic test fixtures exist | Persistent, realistic, labeled, provenance-aware US showcase data | Add origin model, safe source import, idempotent seeding, UI labels, cleanup separation |
| No permanent address | Not a complete public profile option | First-class non-discriminatory option | Update schemas, matching, forms, discovery, and tests |
| Attachments/account privacy | Account export/deactivation covers current alpha state | Cover files, profiles, org membership, verification, inbox, and notifications | Extend transactional deletion/export and backup-aware retention |
| Chat | Fixture route/runtime remains in source; production UI defers it | Polished placeholder only | Remove production fixture construction and prevent any chat mutation/history claim |
| Accessibility | Strong automated local coverage; independent review recorded by owner as complete but evidence is not linked in repository | Regression coverage for every new critical flow | Link independent evidence when available and extend browser suite |
| Legal/policy copy | Unapproved drafts contain stale 16+ and chat statements | 18+, no production chat, ephemeral location, synthetic-data and demo disclosures | Revise only after feature behavior is implemented and reviewable |

## Architectural decisions required by the target

The implementation must record focused ADR updates before affected code lands:

- exact personal location changes from bounded encrypted persistence to
  intentionally non-persistent peer-to-peer exchange;
- exact public-resource location becomes a directory-only, approval-gated
  exception to the one-kilometre public-location rule;
- managed signup creates AT identities rather than a Patchwork-only identity;
- synthetic origin/provenance is application metadata and cannot be forged by
  visitor input;
- attachments use private object storage and short-lived authorization rather
  than public AT blobs by default;
- notification payloads are a derived private channel, never a store for
  sensitive workflow data.

## Current contradictions to resolve

- `docs/legal/*` still describes a minimum age of 16; the charter requires 18.
- The legal drafts describe messages/chat; the target provides only a chat
  placeholder.
- ADR 0003 permits persistent encrypted exact fulfillment location for a
  bounded period; the target prohibits persistence.
- The directory client currently rejects all coordinates more precise than one
  kilometre; the target allows a verified and moderator-approved exception.
- `docs/EXPANSION_DECISION_MATRIX.md` freezes all expansion work under the
  earlier `NO-GO`; the new charter authorizes feature development while leaving
  public-service launch approval unresolved.
- `docs/FULL_APP_FEATURE_ISSUE_PLAN.md` includes native mobile, groups, richer
  chat, reputation, integrations, and multi-region work that is outside this
  charter.

## Completion risk

The highest-risk feature is ephemeral exact-location exchange because absence
of persistence must be demonstrated across code, observability, browser
artifacts, and failure paths. Attachments and managed public signup carry the
next highest abuse and privacy risk. They should not be implemented as thin UI
wrappers over fixture services.

The safest delivery strategy is vertical: add one durable schema/service/API/UI
journey at a time, include export/deactivation/retention in the same slice, and
remove the corresponding fixture path before marking the slice complete.
