# Patchwork buyer-ready web product charter

Status: **approved target for feature completion**

Decision date: 2026-08-05 (America/Chicago; expanded sprint authorization)

Decision source: product-owner interview

This charter defines the feature-complete target for the Patchwork responsive
web application. The goal is a polished, credible, essentially finished
product that can be demonstrated as buyer-ready even though no sale or public
service pilot is planned.

This is a **feature-development GO**, not evidence that Patchwork is approved
to operate as a public mutual-aid service. The operational `NO-GO` recorded in
[`alpha-go-no-go.md`](../operations/evidence/phase-8/alpha-go-no-go.md)
remains the authoritative launch decision until its independent review and
named-ownership evidence are recorded. The live product must not be described
as an emergency service or as an established community program.

## Product objective

Patchwork will be a persistent, shared, United States-focused mutual-aid web
application that demonstrates complete public discovery, account, request,
resource, volunteer, matching, safety, moderation, and account-control
workflows.

The public instance may contain both:

- realistic synthetic records created and maintained as demonstration data;
- content created by registered visitors.

Synthetic and visitor-created records must remain distinguishable in the data
model, moderation tools, exports, retention jobs, and user interface. Synthetic
content must never impersonate a real person or falsely imply that a real
organization participates in Patchwork.

## Intended audience and positioning

- Anonymous visitors may browse, search, and filter public maps, requests,
  resources, organizations, and volunteer profiles.
- Registered adults may create content, offer help, connect, upload
  attachments, receive notifications, report or block others, and manage their
  account.
- Every relevant surface must explain that Patchwork is a portfolio
  demonstration and is not an emergency service.
- Requests that indicate immediate danger or urgent medical need must be
  blocked or quarantined and shown appropriate emergency guidance.
- The application must not claim guaranteed availability, response, identity,
  safety, fulfillment, or organizational endorsement.

## Release scope

### Included

- Responsive web application for desktop and mobile browsers.
- Anonymous map, feed, resource-directory, organization, and volunteer
  discovery.
- Existing AT Protocol OAuth sign-in.
- Patchwork-assisted creation of permanent, user-owned managed AT Protocol
  accounts, followed by the same OAuth/session flow.
- Aid-request and directory-resource creation, editing, discovery, lifecycle,
  closure, and deletion.
- Durable volunteer profiles and availability.
- Durable organization/resource stewardship, verification, renewal,
  revocation, and appeals.
- Explainable request-to-volunteer/resource recommendations.
- Explicit helper offer and requester acceptance.
- Durable inbox/activity center for requests, offers, assignments,
  verification, reports, and notifications.
- Durable in-app and email notifications, plus opt-in browser push.
- Image and PDF attachments with secure access and moderation controls.
- Automated pre-publication input checks, quarantine, reports, blocks, and a
  moderator administration surface.
- Account settings, versioned policy consent, export, and deactivation.
- Realistic synthetic United States data with provenance and safety labeling.
- Structured post-handoff outcome feedback.
- Durable privacy-safe scheduling for participants in accepted connections.
- Production-backed groups with bounded roles, invitations, and rooms.
- Bounded production text chat for active accepted connections and authorized
  group-room members.
- Complete English and Spanish production localization, subject to external
  professional translation review before launch.

### Explicitly excluded

- Native iOS or Android applications.
- Multi-region deployment.
- Contractual uptime or support service levels.
- Production capacity certification.
- External 311, crisis-line, calendar, or partner-system integrations.
- Opaque reputation scores or automatic assignment.
- Emergency-service use.

Operational hardening, protected promotion, independent backup durability,
formal service levels, and production scaling are deferred until after feature
completion. Deferral does not permit a feature to weaken existing
authorization, privacy, retention, or fail-closed behavior.

## Accounts, eligibility, and consent

- Public discovery requires no account.
- Posting, volunteering, matching, connecting, attachment access, reports,
  blocks, and exact-location exchange require an authenticated account.
- Account holders must confirm that they are at least 18 years old.
- Registration must require acceptance of versioned Terms of Use, Privacy
  Notice, Community Guidelines, synthetic-data disclosure, and
  location-sharing consent.
- Material policy changes require renewed consent.
- Managed Patchwork signup must create a permanent user-owned AT identity; it
  must not create an unrelated local-only identity silo.
- Account export and deactivation must cover every new durable subsystem added
  under this charter.

## Location and address policy

### Personal locations

- Personal requests and volunteer profiles may use a real United States
  location, but their public record and marker must retain the existing
  approximately one-kilometre minimum precision.
- Synthetic volunteers receive a realistic service area and approximate map
  position, never a fabricated private street address.
- “No permanent address” is a first-class profile and request option. It must
  not reduce discovery, matching, verification eligibility, or access to
  account features.

### Ephemeral exact-location exchange

An exact personal or meeting location may be shared only after:

1. a helper makes an offer;
2. the requester explicitly accepts the connection;
3. both participants explicitly confirm the exact-location exchange.

The exact coordinate must be transmitted through an authenticated encrypted
live session and must disappear when the connection ends. It must never enter:

- PostgreSQL or another durable application datastore;
- an AT repository record or discovery projection;
- a URL, analytics event, log, trace, screenshot, test artifact, moderation
  payload, backup, notification, or browser-push payload.

The preferred implementation is an authenticated WebRTC data channel with
short-lived signaling. Signaling may be transient, but must contain no exact
location. If the private channel cannot be established, the exchange fails
closed rather than falling back to persistence.

### Verified public-resource locations

A public-facing organization or resource may display a persistent exact
address only when:

- an organization or resource steward proves control;
- the address is already intentionally public;
- the listing records authoritative provenance and a last-verified date;
- the steward explicitly opts in;
- the Patchwork moderator approves exact publication;
- the decision is audited and can be revoked.

Self-asserted exact resource coordinates must be quarantined until approval.
Confidential or protected facilities, including confidential domestic-violence
shelters, are never eligible for exact public display.

## Volunteer, organization, and verification policy

Public volunteer profiles may expose only:

- display name;
- approximate service area;
- skills and categories;
- availability;
- languages;
- accessibility capabilities;
- verification status.

Private contact details, exact home location, verification evidence, and
moderator notes must not appear in public responses.

Verification certifies control of an organization, public resource, or
resource-steward relationship. It must not claim that an individual is safe.
Organization/resource verification:

- has an auditable evidence and decision trail;
- expires after one year unless renewed;
- supports revocation and appeal;
- controls eligibility for persistent exact public-resource addresses;
- never makes private evidence public.

## Matching and connection policy

Patchwork may recommend volunteers and resources using category, approximate
distance, availability, language, accessibility needs, and verification
status. Every recommendation must include a user-readable explanation.

Patchwork must never create an assignment or private connection
automatically. A helper must offer and a requester must accept. Blocking,
deactivation, expiry, moderation state, and capability checks must be applied
before recommendations and again before connection acceptance.

Accepted connection participants may schedule coordination windows and use the
bounded production text-chat runtime. Scheduling stores only canonical time
intervals and the originating IANA timezone, never an exact personal location.
Chat is server-readable and is not end-to-end encrypted; transport and storage
protections must not be described as E2EE. Access ends immediately when the
connection, membership, block, deactivation, room, request, or moderation state
no longer permits it.

## Attachments

- Allowed formats: common safe image formats and PDF.
- Maximum file size: 10 MB per attachment.
- Uploads are private by default.
- Every upload requires MIME/content validation, malware scanning, metadata
  removal, and image re-encoding where applicable.
- Downloads use authenticated, short-lived signed access.
- Files and scan state must survive restart.
- Quarantined or rejected files are never served.
- Deletion, account deactivation, request expiry, and retention jobs must remove
  files and derived variants as defined by policy.
- Moderator tooling must support quarantine, review, and deletion without
  exposing private attachment contents in general logs.

## Notifications and inbox

- Durable in-app notifications are required.
- Email delivery is required.
- Browser push is optional and requires explicit opt-in.
- Users control channel preferences by notification type.
- Offers, connection acceptance, lifecycle changes, verification decisions,
  reports/appeals, expirations, and moderator actions generate notifications.
- An outbox, deduplication key, retry policy, delivery-attempt history, and
  dead-letter state must survive restart.
- Push and email payloads must exclude exact locations, private report details,
  verification evidence, and attachment contents.

## Moderation and safety

The project owner is the initial moderator and trust-and-safety operator.
Moderation is best effort, with a stated target of review within two business
days. Automated quarantine handles high-risk submissions immediately.

Before publication, visitor input must pass:

- schema, length, and allowed-content validation;
- United States location validation;
- public-location precision enforcement;
- prohibited-content and emergency-intent checks;
- likely personal/sensitive-data checks;
- abuse and rate-limit checks;
- attachment scan status when attachments are present.

Uncertain or high-risk content is quarantined, not silently published.
Moderator tools must provide queue filters, evidence-safe previews, decisions,
appeals, audited actions, and one-action content quarantine or new-submission
shutdown.

## Content lifecycle

- Aid requests expire after 30 days unless closed or renewed earlier.
- Directory resources require reconfirmation every 90 days.
- Organization/resource verification expires after one year.
- Synthetic data follows the same lifecycle unless explicitly marked as a
  maintained showcase scenario.
- Expiry and reconfirmation events produce user notifications.
- Visitor-created content must remain separable from synthetic content for
  deletion, moderation, reporting, and export.

## Synthetic and sourced data

- Every synthetic record carries a non-public immutable origin marker and a
  user-visible demo-data indicator.
- Synthetic people are fictional and use non-routable contact details.
- Synthetic volunteer locations are approximate and must not resolve to a
  private residence.
- Real organizations may be represented only from authoritative public
  sources, with provenance, retrieval date, and no implication of participation
  or endorsement.
- Exact organization addresses require the same approval gate as any other
  exact public-resource location.
- Seed generation must be deterministic, idempotent, reviewable, and safe to
  refresh without overwriting visitor content.

## Fail-closed controls

New submissions and exact-location exchange must be disabled when Patchwork
detects or an operator declares:

- a privacy leak;
- an authentication or authorization failure;
- a moderation backlog beyond the stated response window;
- sustained abusive traffic;
- data corruption;
- loss of required monitoring or backup coverage.

Maintenance mode preserves existing state, blocks risky mutations, keeps
public disclosures accurate, and requires explicit moderator recovery.

## Feature-completion acceptance

Patchwork is feature-complete against this charter only when:

1. every included subsystem uses durable or intentionally ephemeral production
   paths rather than fixture services;
2. browser identity is session-derived and every mutation is authorized,
   CSRF-protected, bounded, and idempotent where applicable;
3. personal exact location is proven absent from all durable and observable
   surfaces;
4. synthetic and visitor-created records remain safely separable;
5. anonymous discovery and the authenticated end-to-end journey pass in a
   production build with fixture fallback disabled;
6. restart, retry, deletion, expiry, deactivation, and account-export tests
   cover every new subsystem;
7. scheduling, groups, and bounded chat expose only durable authenticated
   production paths, with fixture paths unreachable;
8. accessibility regression coverage includes every new critical flow;
9. the current-state matrix is updated with evidence rather than intent.

The implementation sequence and evidence requirements are defined in
[`2026-07-28-buyer-ready-web-completion-roadmap.md`](../superpowers/plans/2026-07-28-buyer-ready-web-completion-roadmap.md).
