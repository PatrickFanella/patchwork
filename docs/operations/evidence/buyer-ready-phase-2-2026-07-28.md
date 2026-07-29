# Buyer-ready Phase 2 profiles, organizations, and verification evidence

Date: 2026-07-28

Scope: Phase 2 of
[`2026-07-28-buyer-ready-web-completion-roadmap.md`](../../superpowers/plans/2026-07-28-buyer-ready-web-completion-roadmap.md).

## Result

Phase 2 is complete at the repository and local durable-runtime boundary.

- Volunteer profiles use official AT client create/read/update/delete commands
  with session-derived ownership and CID compare-and-swap. Public profile data
  is projected with cursor, replay, update, delete, and tombstone semantics.
  Private contact and matching fields remain in PostgreSQL and never enter the
  public AT record or discovery response.
- Volunteer discovery supports capability, language, availability, text, and
  bilateral block filtering. No-permanent-address profiles use only an
  approximate service area.
- Organizations, real-DID memberships, hashed one-time invitations,
  owner/admin/steward/member roles, resource stewardship, private audit, and
  90-day reconfirmation events are durable. The former process-local portal and
  invented `did:org:*` identities are removed from production.
- Public organization pages carry server-controlled origin, provenance when
  present, and a non-endorsement label.
- Verification applications, private evidence metadata, decisions, appeals,
  annual expiry, renewal, revocation, and transition audit are durable.
  Applicant and moderator routes derive identity and capability from the
  authenticated session.
- Exact public-resource addresses remain private until a separate moderator
  decision. Public projection additionally requires matching active
  organization and resource verification, active stewardship, a current
  exact-address approval, and a non-confidential facility. Losing any gate
  removes the exact address without exposing it through the AT repository.
- Confidential requests and approval attempts with missing or stale gates are
  quarantined. Automatic expiry and dependent revocation are audited.
- Account export includes the subject's profile, organization, verification,
  appeal, exact-address, and safe attachment metadata. It excludes credential
  material and attachment object keys. Deactivation removes subject-owned
  private state, safely transfers an owned organization when an active admin
  exists, and redacts retained audit attribution.

Migration `0015_volunteer_private_profiles.sql`,
`0016_organizations_and_stewardship.sql`, and
`0017_verification_and_exact_public_addresses.sql` were applied to the local
PostgreSQL acceptance database.

The Phase 5 attachment boundary is intentionally limited here to private
metadata and references that must already be owned, purpose-bound, and marked
clean. This phase does **not** claim real object storage, malware/media
scanning, signed reviewer access, or attachment-byte deletion; those remain
Phase 5 work.

## Verification

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test` | Passed: web 232, API 277 plus 49 environment skips, indexer 35 plus 17 skips, moderation 53 plus 11 skips, AT client 26, lexicons 5, shared 320; map-script tests passed |
| API PostgreSQL integration | 46 passed across 11 files |
| Web direct service integration | 9 passed |
| `npm run build` | Passed |
| Web Chromium E2E | 66 passed, 1 credential-gated live-PDS journey skipped |
| Playwright artifact redaction | Passed; no retained artifacts |
| `npm run test:coverage` | 948 passed, 77 environment-gated tests skipped; 52.04% statements, 41.73% branches, 45.67% functions, 53.01% lines |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |

Focused PostgreSQL tests proved:

- volunteer private/public separation and restart survival;
- organization creation, invitation acceptance, capability boundaries,
  stewardship, reconfirmation, owner transfer, and cleanup;
- private evidence visibility, clean-attachment ownership checks, annual
  approval, renewal/revocation, appeal/uphold, and restart survival;
- exact-address positive publication and fail-closed removal after a
  verification gate changes;
- confidential and verification-incomplete quarantine;
- export without object keys and deactivation cleanup/redaction.

Authenticated Chromium journeys proved volunteer publish/update/discover/delete,
organization ownership/invitation/stewardship/reconfirmation, verification
denial and appeal, moderator approval, exact-address approval, public resource
display, and absence of private reviewer evidence from public discovery.

## External and operational boundary

This phase did not consume live PDS credentials for a new volunteer profile,
organization, or verification exercise. Existing official-client and
controlled PDS evidence remains valid, but protected staging repetition,
partner operations, real attachment infrastructure, and notification delivery
are not represented as newly verified here.

The operational decision in
[`alpha-go-no-go.md`](./phase-8/alpha-go-no-go.md) remains **NO-GO**. Phase 2
completion does not approve public availability, refresh launch evidence, or
convert later roadmap subsystems into operational capabilities.
