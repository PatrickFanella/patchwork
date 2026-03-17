# Patchwork

**Mutual aid, woven.**

Patchwork is a mutual aid coordination platform built on the AT Protocol. It
connects people who need help with volunteers and organisations in their
community through a federated, transparent, and privacy-respecting network.

---

## What Patchwork Is

Patchwork is community infrastructure for getting through it. It provides
tools for:

- **Posting aid requests** -- Describe what you need, categorise it, and share
  it with your community.
- **Offering help** -- Browse nearby requests, volunteer your time or
  resources, and coordinate responses.
- **Discovering needs** -- Map-based and feed-based discovery with filters for
  category, urgency, distance, and status.
- **Coordinating volunteers** -- Onboarding, verification tiers, and profile
  management for volunteers and organisations.
- **Community resources** -- A shared directory of local resources, services,
  and partner organisations.
- **Secure messaging** -- Direct communication between requesters and
  volunteers for coordination.
- **Feedback and outcomes** -- Post-handoff reporting to build trust and
  improve the network.

Patchwork is **not** a charity, a professional services provider, or an
emergency service. It is peer-to-peer mutual aid coordination infrastructure.

## How It Works

### AT Protocol Federation

Patchwork is built on the [AT Protocol](https://atproto.com/), a federated
social networking protocol. This means:

- **Your identity is portable.** Your account is a Decentralized Identifier
  (DID) that you control, not a username locked to one server.
- **Your data is yours.** Content you create is stored in your personal data
  repository and can move between services.
- **The network is open.** Other services on the AT Protocol network can
  interoperate with Patchwork's data formats (Lexicon schemas).
- **No single point of control.** Federation distributes power across the
  network rather than concentrating it.

### Key Features

| Feature                  | Description                                    |
| ------------------------ | ---------------------------------------------- |
| Map discovery            | Clustered, approximate-area discovery with quick triage |
| Feed                     | Nearby request stream with lifecycle actions    |
| Resource directory       | Directory overlays and partner resources        |
| Volunteer management     | Onboarding, verification, and profiles          |
| Chat                     | Routed messaging with typing indicators         |
| Moderation               | Queue-based triage with graduated enforcement   |
| Inbox                    | Unified inbox for requests, assignments, and alerts |
| Feedback                 | Post-handoff outcome reporting                  |
| Offline support          | Offline sync queue for unreliable connectivity  |
| Privacy controls         | Configurable geo-sharing, visibility, and data export |

## Architecture Overview

Patchwork is a monorepo with the following components:

| Component                   | Package / Service               | Role                                        |
| --------------------------- | ------------------------------- | ------------------------------------------- |
| **Patchwork Web**           | `apps/web`                      | Client application (React, TypeScript)       |
| **Patchwork API**           | `services/api`                  | Query, auth, and coordination API            |
| **Spool** (Indexer)         | `services/indexer`              | AT Protocol firehose ingestion and indexing  |
| **Thimble** (Mod Worker)    | `services/moderation-worker`    | Moderation queue processing and policy engine|
| **Shared**                  | `packages/shared`               | Shared types, schemas, and utilities         |
| **AT Lexicons**             | `packages/at-lexicons`          | AT Protocol Lexicon schema definitions       |

### Service Boundaries

- **API** handles authenticated requests, lifecycle actions, and query routing.
- **Indexer** subscribes to the AT Protocol firehose, validates records, and
  maintains the discovery index.
- **Moderation Worker** processes the moderation queue, applies policy actions,
  and maintains the audit trail.
- **Web** is the primary client, rendering map, feed, directory, and settings
  views.

For detailed architecture documentation, see `docs/architecture/`.

## Naming System

A coherent set used across repos, services, workers, and docs:

* **Patchwork Web** -- the client (`patchwork-web`)
* **Patchwork API** -- query + auth (`patchwork-api`)
* **Spool** -- ingestion + queueing ("spool" = feed intake) (`patchwork-spool`)
* **Quilt** -- indexing + search layer ("quilting" = assembling meaning) (`patchwork-quilt`)
* **Stitch** -- chat service (`patchwork-stitch`)
* **Thimble** -- moderation worker (small tool, sharp purpose) (`patchwork-thimble`)

The whole platform is legible through the metaphor: *patches* (needs/offers),
*threads* (conversations), *stitches* (links/verification), *quilt*
(index/overview), *thimble* (moderation tool).

## Taglines

* "Mutual aid, woven."
* "Requests in. Care out."
* "A commons for need, offer, and coordination."
* "Community infrastructure for getting through it."

## Branding

* Icon idea: a **single irregular patch** with 2--3 visible stitches (simple, scalable)
* Motif: **visible seams** = transparency, accountability, and "no magic black box moderation"

## Namespace / API Flavour

* Domain-ish IDs: `patchwork/*`, `pw/*`, or `app.patchwork/*`
* Endpoints that match the metaphor:

  * `GET /threads` (requests/offers)
  * `GET /patches` (individual items)
  * `GET /bundles` (resource groupings)
  * `GET /signals` (alerts/urgent items)
  * `GET /ledger` (optional transparency log for mod actions)

## Legal and Policy Documents

- [Terms of Service](./legal/terms-of-service.md)
- [Privacy Policy](./legal/privacy-policy.md)
- [Community Guidelines](./legal/community-guidelines.md)
- [Acceptable Use Policy](./legal/acceptable-use-policy.md)
- [Policy Changelog](./legal/changelog.md)

## Operations

- [RACI Matrix](./operations/raci.md)
- [Moderation SOPs](./operations/moderation-sops.md)
- [Verification Appeals](./operations/verification-appeals.md)
- [SLI/SLO Definitions](./operations/sli-slo.md)
- [Alerting Policy](./operations/alerting-policy.md)
- [Secrets Rotation](./operations/secrets-rotation.md)
