# Buyer-ready evaluator guide

Updated: 2026-07-29

Patchwork is a responsive mutual-aid coordination product with implemented
anonymous and authenticated journeys. It remains operationally **NO-GO** for a
public launch; feature completion is not safety, legal, provider, accessibility,
or operations certification.

## Start here

1. Open Home and read the pre-alpha/non-emergency boundary.
2. Browse Map, Feed, Resources, Volunteer, and Organizations anonymously.
3. Sign in with an existing AT account or use managed account creation.
4. Accept all current policy documents and assert that you are 18 or older.
5. Use the authenticated routes for posting, profile/organization stewardship,
   verification, private attachments, offers/connections, inbox/outcomes,
   notifications, Settings/export/deactivation, and authorized moderation.

The [desktop home screenshot](./screenshots/buyer-ready-home-desktop.png) and
[mobile Chat screenshot](./screenshots/chat-placeholder-mobile.png) show the
current production-mode presentation.

## How to read data

- **Synthetic showcase** means a fictional person, need, offer, workflow, or
  organization created by the deterministic showcase seed.
- **Public-source reference** means an attributed public organization
  reference. It does not claim participation, endorsement, or current service
  availability.
- Unlabeled live records are **visitor-created**.
- Public personal and volunteer locations are approximate. A personal exact
  coordinate is ephemeral peer-to-peer data, while a public-resource exact
  address requires separate verification and moderator approval.

## State and safety behavior

- Loading, empty, validation, server/network error, retry, retained-data stale,
  offline, and maintenance/read-only states are explicit.
- Patchwork does not queue mutations while offline.
- A moderation or required-provider failure prevents publication.
- Maintenance preserves safe reads but blocks new submissions and exact
  exchange until an audited authorized resume.
- Patchwork is not emergency dispatch and does not guarantee a match, response,
  fulfillment, identity, or moderation time.

## Chat boundary

Production Chat is intentionally unavailable. The route has no history, form,
initiation control, API mutation, or fixture fallback. Coordination occurs
through structured offers, connections, activity items, and outcomes.

## Evidence and residual gates

- [Current-state matrix](../architecture/current-state-matrix.md)
- [Buyer-ready API contract map](../architecture/buyer-ready-api-contracts.md)
- [Local WCAG 2.2 AA audit](../operations/evidence/phase-8/accessibility-audit.md)
- [Feature-completion acceptance](../operations/evidence/buyer-ready-phase-9-feature-completion-2026-07-29.md)
- [Operational go/no-go](../operations/evidence/phase-8/alpha-go-no-go.md)

The local accessibility evidence is automated/manual repository evidence, not
an independent conformance review. No owner-supplied independent
WCAG/assistive-technology report is present. That operational gate and every
other NO-GO item remain open unless separately evidenced and approved.
