# Buyer-ready product-gap sprint completion

Date: 2026-08-04 (America/Chicago)  
Verified implementation through: `43deb5e9`
Repository decision: **COMPLETE**  
Operational decision: **NO-GO**

## Outcome

The post-roadmap product-gap sprint is complete at the repository and isolated
runtime boundary. It closes the reported OAuth callback/session handoff,
removes misleading deferred navigation, makes map-area selection explicit and
reversible, and converts outcome safety concerns into durable moderator
casework. The fixed privacy boundaries and operational NO-GO remain unchanged.

This is not launch approval. The independent reviews, named ownership, live
provider credentials, and protected production operations listed below remain
external gates.

## Implemented slices

| Slice | Result | Focused commit |
| --- | --- | --- |
| OAuth callback restoration | A successful OAuth callback now passes through a same-origin restoration page, verifies the cookie-backed Patchwork session before navigation, strips sensitive callback fields, preserves only a sanitized return route, and exposes bounded retry/re-login states. A callback reached without a session now terminates in an explicit recoverable state instead of waiting indefinitely. | `961edd5b`, `43deb5e9` |
| Truthful production navigation | Scheduling, feedback, and groups are absent from production navigation. Direct visits remain fail-closed deferred pages without forms, fixture data, or mutation controls. Chat remains the intentional non-mutating placeholder. | `c8347748` |
| Map interaction and privacy | Stable per-request displacement keeps a displayed aid-circle center from revealing the supplied approximate coordinate after the minimum-1km quantization. Clusters split progressively by zoom; labels show bounded area information; filled, outline, and high-contrast styles persist locally. Circle selection centers the map and creates an explicit URL-backed area filter with Back, Forward, clear, and return-to-previous behavior. Current moderator-approved public resources remain the only exact point-marker class. | `36905c0b` |
| Outcome safety escalation | Submitting a safety-tagged outcome atomically writes the feedback, one high-priority moderation case, and one moderator notification. The review preview excludes the private comment, participant DIDs, and exact location, retaining only bounded outcome/rating context, a request hash, and connection reference. Duplicate feedback cannot create duplicate casework. | `aab44028` |
| Dependency security | Patched the transitive ATProto/jsdom Undici lines to 6.28.0, 7.29.0, and 8.10.0 after the current audit feed disclosed a high-severity advisory. A fresh image scan then found two additional HIGH findings in npm's bundled toolchain; the image build now checksum-pins fixed `brace-expansion` 5.0.9 and `ip-address` 10.4.0 replacements. | `2611af4b`, `45e21906` |

## Fresh acceptance gate

A new isolated `patchwork_sprint_20260804` database was created and migrated
from zero. No production rows or participant content were used.

| Gate | Result |
| --- | --- |
| Fresh migrations | API 22, indexer 6, moderation 5 |
| Repository `npm run check` | Passed twice, including after the dependency update |
| Unit/contract baseline | Web 254; API 314 runnable with 75 environment skips; indexer 35 with 17 skips; moderation 53 with 18 skips; AT client 26; lexicons 5; shared 322; map archive and exact-location absence gates passed |
| API PostgreSQL integration | 69 passed across 16 files |
| Indexer PostgreSQL integration | 52 passed |
| Moderation PostgreSQL integration | 71 passed |
| Real object/scanner integration | 1 passed against isolated MinIO and ClamAV |
| Web service integration | 8 passed |
| Production build | Passed; Vite emitted only the existing bundle-size advisory |
| Production-bundle Chromium | 98 passed in 6.5 minutes; 1 credential-required real PDS lifecycle skipped |
| Browser accessibility | Eighteen unfiltered axe route scans plus keyboard, focus, landmark, 320px reflow, 200% text, and reduced-motion cases passed |
| Browser artifact redaction | Passed with zero retained trace/screenshot artifacts |
| Diagnostic coverage | 1,009 passed with 110 environment skips; 46.39% statements, 36.41% branches, 41.14% functions, 47.25% lines |
| Dependency audit | Production-only and full dependency trees report 0 vulnerabilities |
| Prometheus rules | `promtool check rules` passed all 18 rules |

The repository absence guard still checks 42 durable schema, export, backup,
and HTTP-log surfaces for forbidden exact-person location fields. The new map
state stores only circle style in browser local storage; selected area filters
use the already-public displaced center and minimum radius. The new safety case
contains no exact coordinate or participant identity.

## Completion review

| Question | Finding |
| --- | --- |
| Is any buyer-ready roadmap capability still a fixture or contract-only path? | No. Fixture/contract rows that remain in the current-state matrix are excluded expansion work: chat implementation, scheduling, groups, reputation, offline/PWA, native mobile, multi-region, and external connectors. |
| Are there misleading production placeholders? | Chat is the one intentional buyer-ready placeholder. Deferred expansion routes are not advertised and remain explicitly non-mutating on direct access. |
| Does the reported OAuth problem have a verified software fix? | Yes at API, web-flow, and production-bundle browser boundaries. A fresh live PDS callback still requires a real account credential and is not claimed here. |
| Does map interaction preserve the geoprivacy boundary? | Yes. Aid centers are displaced after minimum-1km quantization, exact personal pins remain prohibited, and the existing 42-surface absence gate passes. Exact markers remain limited to separately approved public resources. |
| Does a safety-tagged outcome reach durable casework? | Yes. Feedback, high-priority case, and notification are one transaction with privacy-safe preview and duplicate suppression. |
| Is the application approved for public operation? | No. The operational NO-GO remains binding. |

## Remaining external and expansion work

These are not incomplete acceptance criteria for the buyer-ready roadmap, but
they remain real gaps:

- fresh credentialed live PDS callback and two-account lifecycle repetition;
- managed-signup recovery-email exercise and credential rotation;
- protected live email/Web Push delivery and provider feedback exercise;
- independent WCAG/assistive-technology, legal, privacy, retention, and AT
  repository-boundary review;
- named product, engineering, infrastructure, privacy, trust-and-safety,
  incident-command, and on-call acceptance;
- protected GHCR/OIDC promotion, independent backup/object-store durability,
  production sizing, and human alert acknowledgment;
- representative pilot validation for matching fairness, outcome analysis, and
  moderation policy operations;
- intentionally deferred expansion features listed in the current-state
  matrix.

The immutable-staging, rollback, restore, alerting, and bounded-capacity
mechanisms remain previously demonstrated home-staging evidence, not public
production certification.

## Deployment evidence

Immutable revision `43deb5e9928b3f3c17916146c92bab3d569aa38b` is
deployed on home staging. Before replacement, the release process published and
validated `patchwork_20260805_044900.dump` with its checksum and metadata. The
immediately previous `45e21906` exact-digest release is retained for rollback.

All four exact-release images parse to zero HIGH/CRITICAL findings under Trivy
0.59.1 and verify against the retained scoped Cosign public key. The signatures
use the local home-registry key without Rekor transparency and are not claimed
as protected GHCR/OIDC evidence. The digest manifest and scan/signature reports
are retained under the `0600` release directory.

Deployment replayed API 22, indexer 6, and moderation 5 migrations with no new
migration required. API, indexer, moderation, and web containers report the
exact revision, healthy status, zero restarts, and no error/fatal log lines.
Public health, contracts, and `/map` return 200; anonymous `/api/auth/session`
returns the intentional 401 `AUTHENTICATION_REQUIRED` contract; the
content-addressed PMTiles range returns 206/1,024 bytes and the mutable path
returns 404.

A live Chromium pass rendered one map container, one labeled 100-request
cluster, and repeated 206 PMTiles reads with no map alert. Production navigation
contained none of Scheduling, Feedback, or Groups. Clicking the live cluster
created a visible area filter at
`/map?r=6991&lat=40.716541&lng=-74.004138`; outline mode survived reload and
Clear returned to `/map`. A separate clean-browser visit to
`/auth/callback?returnTo=%2Fmap` without a session sanitized the URL, terminated
the checking state, and rendered the explicit new-login recovery action.

No credentialed browser state or disposable account secret was available for a
fresh live OAuth callback or real safety-feedback mutation. Those two external
mutations are not fabricated here: callback/session restoration is covered by
the API/web production-bundle gate, and safety escalation is covered by the
fresh PostgreSQL transaction plus two-context browser gate. A user-authenticated
live retry remains external evidence.
