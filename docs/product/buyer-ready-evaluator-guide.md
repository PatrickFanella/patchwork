# Buyer-ready evaluator guide

Updated: 2026-08-05

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
   notifications, scheduling, groups, bounded chat,
   Settings/export/deactivation, and authorized moderation.

The [desktop home screenshot](./screenshots/buyer-ready-home-desktop.png) is a
historical visual reference. Executable production-bundle browser tests are
the current source of truth for the scheduling, groups, chat, and localized
surfaces.

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

## Scheduling, groups, and chat boundary

Accepted-connection participants can propose and confirm bounded scheduling
windows. Authenticated members can create role-controlled groups and rooms by
using hashed, expiring, single-use invitations. Chat is available only on an
active accepted connection or to current members of an active group room.

Chat text is server-readable, not end-to-end encrypted, and retained for up to
365 days. Notification and conversation-list previews exclude message bodies.
Removing access through a block, departure, removal, closure, deactivation, or
moderation decision takes effect on the next operation. Exact personal
locations remain restricted to the separate ephemeral peer exchange.

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
