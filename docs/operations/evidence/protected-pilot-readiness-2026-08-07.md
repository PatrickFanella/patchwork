# Protected pilot readiness evidence — 2026-08-07

Decision: **NO-GO for participants and public traffic**.

All sprint work executable with repository, local-integration, and authorized
home-staging access is complete. The remaining gates require credentials,
independent reviewers, a distinct human secondary, or production authority
that were not supplied; none is represented as passing.

## Scope and acceptance

- Sprint plan:
  `docs/superpowers/plans/2026-08-07-protected-pilot-readiness-sprint.md`
- Traceability register: `docs/test-traceability-protected-pilot.json`
- Executable traceability check: `scripts/check-sprint-traceability.mjs`
- Coverage: 8 user stories and 40 atomic acceptance criteria, including actor,
  need, outcome, unhappy paths, privacy/security constraints, evidence source,
  and launch consequence.
- Preserved experiments: legacy group coordination, reputation, native mobile,
  multi-region, matching, and connector stubs remain explicitly non-production.

## Repository and integration verification

| Gate | Result |
| --- | --- |
| `npm run check` | Passed |
| Unit/contract tests | 1,017 passed; 118 environment-gated skips |
| Suite detail | web 256; API 321 runnable; indexer 35 runnable; moderation 53 runnable; AT client 26; lexicons 5; shared 321 |
| Diagnostic coverage | 42.95% statements; 33.72% branches; 38.00% functions; 44.13% lines |
| Production build | Passed; existing bundle-size advisory only |
| Dependency audits | Production and full-tree HIGH threshold passed; 0 vulnerabilities |
| Fresh PostgreSQL 16 migrations | API 25, indexer 6, moderation 5; immediate replay applied 0 |
| Fresh PostgreSQL suites | API 77; indexer 52; moderation 71; web service integration 8 |
| Real private attachments | MinIO/clamd end-to-end case passed |
| Production-bundle Chromium | 147 passed; 1 credentialed live-PDS case skipped; 10.3 minutes |
| Browser artifact redaction | 0 files retained |
| Exact-location absence | 45 durable/schema/export/backup/log surfaces passed |
| Prometheus rules | Repository and live Prometheus validation passed; 20 rules loaded |

The skipped tests are explicit environment/provider gates rather than hidden
passes. Broad runtime wiring and the retained expansion stubs account for much
of the diagnostic coverage gap; story-level acceptance is traced separately.

## Immutable release and deploy-host trust

Application revision: `768f9ca5cb7c2b6f3d0127549ea89ea4b1eff24a`.

| Service | Immutable digest | HIGH/CRITICAL |
| --- | --- | ---: |
| API | `sha256:416e341bbae78ce8c03f8d1bfae0c5882271289f47f387e5cac84e9c039e4afd` | 0 |
| Indexer | `sha256:81d4eb96f3ef4bf9648c20c79ba8cd895b2c59afb9e841f237742888fdd6ec6a` | 0 |
| Moderation | `sha256:fdc9faaf5d5f37ae2047e8e43a4de16cdd89fdd4011bd39f18d0c8901e6cf2e2` | 0 |
| Web | `sha256:0966ce499d642ddc0e4293684d4222982408bec25c1cb460e47aae8203e6a4be` | 0 |

For every digest, the release directory retains a Trivy report, SPDX JSON
SBOM, SLSA provenance predicate, Cosign signature verification result, and
verification results for `spdxjson` and `slsaprovenance` attestations. The
deploy host verified all three trust objects before pulling or mutating release
state. Artifact checksums are retained beside the manifest.

The home-staging boundary uses a retained encrypted local Cosign key, a
loopback private registry, and explicit insecure-registry/no-transparency-log
verification flags. Those flags default off in code. This is valid scoped
home-staging evidence, not a substitute for the protected keyless GHCR/OIDC
workflow.

Deployment replayed API/indexer/moderation migrations at 0 applied and
25/6/5 skipped, then reached healthy state for all four services. Revision
labels matched the manifest, restart counts were zero, the content-addressed
PMTiles request returned 206 with 1,024 requested bytes, and the mutable tile
path returned 404.

## Capacity and stability

The capacity evidence is intentionally split rather than averaged into a
misleading pass:

- An initial local run was stopped after it measured the single-client abuse
  limiter instead of service capacity.
- A five-minute 40-RPS run through an SSH tunnel was rejected because the
  tunnel path produced three timeouts and 1.1–1.7-second p95 latency.
- A direct trusted-Almaz five-minute attempt at 10 RPS on each of four routes
  also failed: 6,330 responses completed, 264 timed out, and actual throughput
  ranged from 4.03 to 6.45 RPS. During the run, shared-host load reached 19–29,
  swap was fully consumed, and unrelated database containers used substantial
  CPU. Patchwork remained healthy with zero restarts.
- After the heaviest unrelated jobs subsided but recurring contention remained,
  a separate direct five-minute stability soak at 2 RPS per route completed
  exactly 2,400 responses with zero errors. Actual throughput was 2 RPS on
  every route; p95 was 85.801 ms health, 162.009 ms map, 199.541 ms feed, and
  213.556 ms directory. All four services remained healthy at zero restarts.

The current release is therefore stable at 8 aggregate read RPS under the
observed contention, but the earlier 40-RPS home-staging point is **not
re-certified**. A clean-window five-minute mixed 40-RPS rerun is required
before pilot reconsideration. This is an operational environment gap, not a
passing capacity exception.

## Rollback and forward recovery

The retained `d791fb015fb2d6839b509bc3f873b3062d4a8b49` manifest and its four
signatures were verified before it became rollback state. Both current and
previous manifests carry checked SHA-256 sidecars.

The rollback command verified the previous checksum, restored all four
services to revision `d791fb01`, passed backend readiness and map assertions,
and reported zero restarts. The normal deployment path then reverified every
`768f9ca5` signature and attestation, replayed migrations idempotently, and
promoted all four services forward to healthy state. Tampered and unverified
state refusal is also covered by operational tests.

## Recovery and independent durability

Systemd completed a fresh post-deploy PostgreSQL 17 staging backup at
2026-08-07 04:14 CDT: `patchwork_20260807_091405.dump`, 312,668 bytes, SHA-256
`b2778c7f5c06cd9808915447e24414488429ee03c14da83fea80591539d338ab`.
Archive validation and its checksum passed. The immediately preceding validated
archive was restored into a fresh empty PostgreSQL 17 target successfully in
3 seconds with a measured 82-second recovery point; restored browser sessions
were zero and scheduling, group, and chat tables were verified. The disposable
target was removed.

The independent-replication implementation separately snapshots the database
and private attachment objects to an encrypted S3-compatible destination,
records a byte/checksum manifest, reads objects back for verification, exposes
success/failure/freshness metrics, preserves last-success on failure, and has
alert rules that also fail closed when series are absent. Mocked executable
tests cover success, readback, and failure behavior. No independent S3
credentials were available, so a live off-host copy is not claimed.

## On-call and review authority

Patrick Fanella is the accepted home-staging primary on-call, escalation
owner, and default incident commander. The review register and game-day record
do not invent approvals. The human game day remains `NOT RUN` because no
distinct secondary responder was supplied and no human acknowledgment occurred.

The following also remain external and blocking:

- protected GHCR/OIDC keyless release execution;
- credentialed disposable PDS/session signup, OAuth recovery, record lifecycle,
  and cleanup repetition;
- protected email and Web Push delivery/feedback exercises;
- live encrypted independent database and private-object replication;
- independent security, privacy, WCAG/assistive-technology, professional
  Spanish translation, and legal/policy reviews;
- sustained staffed rotation and production capacity/traffic authority.

## Decision consequence

Home staging may remain available for controlled operator experimentation.
Public traffic, participant recruitment, and protected-pilot launch remain
disabled. Reconsideration requires current evidence for every external item
above; absence, a skipped test, or an unsigned acknowledgment is not an
exception.
