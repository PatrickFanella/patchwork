# Patchwork Full-App Feature Completion Plan

This roadmap extends beyond production hardening and focuses on product completeness:

- fully implemented core user journeys,
- missing feature domains from v1 exclusions,
- and expansion features expected in a mature mutual-aid platform.

It is intended to run in parallel with `docs/PRODUCTION_ISSUE_PLAN.md`.

## Current functional baseline

Validated from code and docs:

- Web routes/surfaces exist for `map`, `feed`, `resources`, `volunteer`, `posting`, `chat`.
- Query/discovery, chat safety, volunteer onboarding, and moderation primitives are implemented.
- Several runtime paths are still fixture-oriented or shell-like and require full productization.
- Prior v1 exclusions: native mobile apps, public group chats, advanced reputation marketplace, multi-region launch.

---

## Product milestones

1. **P0 — Core Journey Completion** (Weeks 1-3)
2. **P1 — Identity + Account System** (Weeks 2-4)
3. **P2 — Collaboration + Communication Depth** (Weeks 3-6)
4. **P3 — Trust, Reputation, and Partner Ecosystem** (Weeks 5-8)
5. **P4 — Mobile + Accessibility + Internationalization** (Weeks 7-10)
6. **P5 — Growth, Intelligence, and Multi-Region Scale Features** (Weeks 9-12)

---

## Epic G: Core journey completion

### Issue G1 — Implement canonical request lifecycle state machine end-to-end

- **Suggested labels**: `feature`, `backend`, `frontend`, `core-flow`
- **DoD**:
  - Explicit transitions: `open -> triaged -> assigned -> in-progress -> resolved -> archived`.
  - Transition permissions enforced by role/capability.
  - Timeline + audit events visible in UI and API.

### Issue G2 — Build assignment + handoff workflow for volunteers/resources

- **Suggested labels**: `feature`, `routing`, `workflow`
- **Depends on**: G1
- **DoD**:
  - Request can be assigned to helper/resource with acceptance/decline timeout.
  - Automatic reassignment path when helper becomes unavailable.
  - Handoff completion marker captured with outcome notes.

### Issue G3 — Create user inbox/dashboard for active requests, offers, and chats

- **Suggested labels**: `feature`, `frontend`, `experience`
- **Depends on**: G1, G2
- **DoD**:
  - Single inbox for “needs help”, “I’m helping”, “messages”, and “alerts”.
  - Unread/state counters and actionable cards.
  - Deterministic E2E coverage for primary dashboard actions.

### Issue G4 — Add attachment support (images/docs) for requests and handoffs

- **Suggested labels**: `feature`, `media`, `api`
- **Depends on**: G1
- **DoD**:
  - Upload, preview, and secure access policy for image/document attachments.
  - Safety scanning/moderation hooks for uploaded files.
  - Rate/size limits + graceful failures in UI.

---

## Epic H: Identity, profiles, and account management

### Issue H1 — Implement full AT-native auth session UX (login/logout/refresh)

- **Suggested labels**: `feature`, `identity`, `frontend`
- **DoD**:
  - Real auth flows replace shell-only session assumptions.
  - Session refresh and expiration UX handled cleanly.
  - Auth errors mapped to user-safe recovery actions.

### Issue H2 — Add account settings and privacy controls center

- **Suggested labels**: `feature`, `privacy`, `frontend`
- **Depends on**: H1
- **DoD**:
  - User can manage profile visibility, contact preferences, and geo-sharing level.
  - Data export and account deactivation entry points exist.
  - Settings changes are auditable.

### Issue H3 — Role and capability model (requester, volunteer, moderator, org-admin)

- **Suggested labels**: `feature`, `authorization`, `backend`
- **Depends on**: H1
- **DoD**:
  - Role-capability matrix enforced in API and reflected in UI.
  - Privileged actions require explicit capability.
  - Regression tests cover privilege boundaries.

---

## Epic I: Communication and coordination depth

### Issue I1 — Upgrade chat to full conversation UX (threads, receipts, retries)

- **Suggested labels**: `feature`, `chat`, `frontend`
- **Depends on**: G3, H1
- **DoD**:
  - Read/delivery states, retry on failure, and conversation state indicators.
  - Message history pagination and deterministic ordering.
  - Abuse/report actions available in every thread.

### Issue I2 — Add public/private group coordination spaces (v1 excluded feature)

- **Suggested labels**: `feature`, `chat`, `groups`
- **Depends on**: I1, H3
- **DoD**:
  - Group channels with membership and moderation controls.
  - Request-linked temporary coordination rooms.
  - Policy tooling for group abuse handling.

### Issue I3 — Notifications center + delivery channels

- **Suggested labels**: `feature`, `notifications`, `engagement`
- **Depends on**: G1, I1
- **DoD**:
  - In-app notifications with read/unread + filter views.
  - Email/push/webhook channel adapters with per-user preferences.
  - Notification reliability and deduplication checks.

### Issue I4 — Calendar and shift scheduling for volunteers

- **Suggested labels**: `feature`, `volunteer`, `scheduling`
- **Depends on**: H3, I3
- **DoD**:
  - Volunteers can publish recurring availability windows.
  - Shift assignment and reminders integrate with request lifecycle.
  - Conflict detection and no-show fallback path implemented.

---

## Epic J: Trust, reputation, and partner ecosystem

### Issue J1 — Implement reputation and reliability scoring (v1 excluded feature)

- **Suggested labels**: `feature`, `trust`, `ranking`
- **Depends on**: G2, H3
- **DoD**:
  - Transparent score inputs: completion rate, response reliability, community feedback.
  - Safety guardrails to prevent brigading/manipulation.
  - Score influence on routing is explainable and test-covered.

### Issue J2 — Verification tiers for volunteers and organizations

- **Suggested labels**: `feature`, `trust-safety`, `verification`
- **Depends on**: H3
- **DoD**:
  - Tiered verification badges and expiry/renewal flow.
  - Manual + automated review checkpoints.
  - Verification events auditable.

### Issue J3 — Organization/partner portal for resource providers

- **Suggested labels**: `feature`, `directory`, `b2b`
- **Depends on**: H3, J2
- **DoD**:
  - Partners can manage directory records, service status, and intake constraints.
  - Organization admins can manage team members and permissions.
  - SLA-style response performance visible to org admins.

### Issue J4 — Feedback and outcome reporting loop

- **Suggested labels**: `feature`, `impact`, `quality`
- **Depends on**: G2
- **DoD**:
  - Participants submit post-handoff feedback and outcomes.
  - Structured taxonomy for success/failure reasons.
  - Feedback aggregates into trust and product analytics.

---

## Epic K: Mobile, accessibility, and global readiness

### Issue K1 — Progressive Web App offline-first support

- **Suggested labels**: `feature`, `pwa`, `mobile`
- **DoD**:
  - Installable PWA with offline cache for critical views.
  - Deferred sync for posting/updates while offline.
  - Offline/online state UX with conflict resolution.

### Issue K2 — Native mobile app strategy and first release (v1 excluded feature)

- **Suggested labels**: `feature`, `mobile`, `ios`, `android`
- **Depends on**: K1, I3
- **DoD**:
  - Shared API contracts consumed by iOS/Android client.
  - Core flows shipped: map/feed/post/chat/inbox/notifications.
  - Mobile QA matrix and app-store release checklist complete.

### Issue K3 — Accessibility AA+ compliance program

- **Suggested labels**: `feature`, `a11y`, `frontend`
- **DoD**:
  - WCAG 2.2 AA audit complete with tracked fixes.
  - Keyboard/screen-reader parity for all critical flows.
  - Ongoing accessibility regression checks added to CI.

### Issue K4 — Internationalization and localization framework

- **Suggested labels**: `feature`, `i18n`, `frontend`
- **DoD**:
  - Locale-aware copy/date/number formatting.
  - Translation pipeline and fallback handling.
  - At least two production locales enabled.

---

## Epic L: Intelligence, growth, and scale features

### Issue L1 — Smart matching assistant (explainable, preference-aware recommendations)

- **Suggested labels**: `feature`, `matching`, `ai-assist`
- **Depends on**: I4, J1
- **DoD**:
  - Candidate recommendations for volunteers/resources include explanation traces.
  - Operator override and feedback loop improve ranking inputs.
  - Safety review for bias/fairness constraints completed.

### Issue L2 — Impact analytics dashboard for communities and partners

- **Suggested labels**: `feature`, `analytics`, `insights`
- **Depends on**: J4
- **DoD**:
  - Metrics for response times, completion rates, unmet demand, and coverage gaps.
  - Filterable by geography/category/time range.
  - Export endpoints for partner reporting.

### Issue L3 — Multi-region tenant support (v1 excluded feature)

- **Suggested labels**: `feature`, `platform`, `multi-region`
- **Depends on**: production infra milestones + K2
- **DoD**:
  - Region-aware data residency and routing model documented + implemented.
  - Tenant boundaries and policy overrides supported.
  - Cross-region failover posture validated.

### Issue L4 — Integrations marketplace (311/crisis lines/community tools)

- **Suggested labels**: `feature`, `integrations`, `ecosystem`
- **Depends on**: J3, I3
- **DoD**:
  - Connector framework for external service partners.
  - Inbound/outbound sync with audit and retry handling.
  - At least two real integration adapters in production.

---

## Parent tracking issue template

Use one parent issue titled:

`[Product] Full App Feature Completion Program`

Body should include milestone grouping and child checklists for Epics G-L.

---

## Full-app completion criteria

Patchwork is considered a fully fledged app when:

1. Core request → assignment → handoff → outcome journeys are complete and measurable.
2. Auth, accounts, roles, and privacy controls are fully implemented.
3. Communication includes 1:1 + group + notifications + scheduling.
4. Trust layer includes verification, reputation, and partner operations.
5. Mobile, accessibility, and localization are production-grade.
6. Intelligence/analytics/integrations and multi-region capabilities are live.
