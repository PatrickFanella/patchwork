# Buyer-ready Phase 8 showcase and presentation evidence

Date: 2026-07-28  
Verified revision: `7e6de374`

## Implemented boundary

- `db:seed:showcase` creates a deterministic, transactional buyer journey with
  fictional identities, approximate Chicago locations, an aid workflow and
  handoff, accepted offer, completed connection and outcome, fictional
  organization, moderation case, notification, and one attributed official
  City of Chicago public-source reference.
- Durable immutable metadata distinguishes `synthetic`, `sourced-public`, and
  `visitor-created` records. Sourced records require HTTPS provenance,
  retrieval and verification dates, and an explicit non-participation
  statement.
- Seed replay is serialized by an advisory lock, refreshes only rows already
  labeled for the same seed, preserves visitor records, and refuses untagged
  reserved-key collisions. Showcase identities cannot be deactivated through
  the account endpoint.
- Feed, directory, volunteer discovery, moderation, export, and public
  projection surfaces preserve or display record origin. Synthetic contact
  data uses `.invalid`; public service areas retain at least one-kilometre
  precision.
- Production-mode web states explicitly distinguish offline, unavailable,
  potentially stale retained data, maintenance read-only mode, synthetic
  records, and sourced-public records. Mutations are never described as queued.
- Public Terms, Privacy, and Community routes align with the unapproved legal
  drafts: 18+, no production chat, ephemeral exact peer location, approved
  exact public-resource addresses, private attachments, best-effort
  moderation, and the continuing operational NO-GO.
- The evaluator guide and versioned desktop/mobile screenshots link directly
  to the current-state matrix, local accessibility audit, and go/no-go record.

## Verification

All database checks used a fresh `patchwork_phase8_gate_20260728` database.
The real attachment check used the existing isolated loopback MinIO and ClamAV
services; no unrelated port owner was changed.

| Gate | Result |
| --- | --- |
| Fresh migrations and seed replay | API 22, indexer 6, moderation 5; two seed runs produced identical manifest `e6531c473a615e5d188d922c8b1c49c04881dbefc20260a72c302a457df40d11`; 14 synthetic and 1 sourced-public metadata rows |
| Lint and typecheck | All workspaces passed |
| Repository unit/contract gate | Web 237; API 303 with 74 environment skips; indexer 35 with 17 skips; moderation 53 with 18 skips; AT client 26; lexicons 5; shared 322; map and 42-surface exact-location absence checks passed |
| Fresh PostgreSQL gate | API 68, indexer 52, moderation 71 passed; the gate caught and corrected one stale moderation migration-count assertion |
| Real attachment services | 1 passed: transformed clean bytes, malware quarantine, restart access, and deletion cleanup |
| Web service integration | 8 passed |
| Production build | All workspaces passed; Vite emitted only the existing bundle-size advisory |
| Complete Chromium gate | 96 passed, 1 credentialed external OAuth/PDS journey skipped; 18 zero-violation axe scans plus reflow, text sizing, reduced motion, privacy, showcase, legal, and protected journeys passed |
| Browser artifact redaction | Passed; no retained Playwright artifact files |
| Diagnostic coverage | 981 passed with 109 environment skips; 46.06% statements, 36.10% branches, 40.73% functions, 46.94% lines |
| Prometheus rules | `promtool check rules` passed, 18 rules |
| Dependency audit | Production and full dependency trees: 0 vulnerabilities |

## Operational status

Phase 8's software exit criterion is satisfied locally: seeded data is
deterministic and unmistakably labeled, visitor-created data is protected,
production presentation states are truthful, policy copy matches implemented
behavior, and the buyer-facing routes pass the complete browser gate.

This is not launch approval. No owner-supplied independent WCAG 2.2 or
assistive-technology review, formal legal/privacy approval, credentialed live
signup repetition, protected staging alert receipt, or named operational
ownership was supplied. The operational decision therefore remains **NO-GO**.
