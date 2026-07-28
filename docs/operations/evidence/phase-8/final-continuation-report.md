# Patchwork continuation status report

Snapshot: 2026-07-28, current `main` worktree

Recommended decision: **NO-GO**

## Completion snapshot

| Phase | Roadmap checklist | Current assessment |
| --- | ---: | --- |
| 1. Authoritative architecture | 14/14 (100%) | Complete; both tasks committed in `23aecd7` |
| 2. Real AT vertical slice | 21/21 (100%) | Direct two-account PDS lifecycle proven |
| 3. Durable state | 18/18 (100%) | Complete locally, including moderation and retention |
| 4. Secure HTTP surface | 18/18 (100%) | Complete locally |
| 5. Live indexer | 17/17 (100%) | Runtime plus controlled live aid and directory lifecycles complete |
| 6. Integrated web journey | 16/16 (100%) | Real two-account OAuth journey passed against the NUC runtime |
| 7. Real staging operations | 18/18 (100%) | Signed digest deployment, rollback, recovery, alerting, and post-deploy browser acceptance complete on NUC staging |
| 8. Evaluation and scope control | 11/14 (79%) | `NO-GO`, expansion frozen, closure prepared; approvals pending |

Raw roadmap completion is 133/136 items (98%). This is not a launch score: the
remaining items are human authorization/decision gates, so the project is
still `NO-GO`.

The roadmap's narrow core paths are implemented locally: authentication
adapters, AT CRUD, lifecycle, moderation, HTTP security, ingestion,
projections, discovery, browser commands, deployment mechanisms,
backup/restore, metrics, alerts, and private-data retention have production
paths without fixture fallback. Authenticated account export and durable
Patchwork account deactivation now include session revocation, retained-data
exceptions, and suppression of future login/projection resurrection. Independent
AT-repository deletion and formal privacy approval remain external boundaries.
The hourly API and moderation schedulers have also removed representative
expired rows on their natural immutable-staging cadence with successful
metrics, zero alerts, and zero restarts.

## Verification baseline

- repository unit/contract suite: 897 tests;
- API suite with PostgreSQL enabled: 301 tests;
- indexer suite with PostgreSQL enabled: 51 tests;
- moderation suite with PostgreSQL enabled: 64 tests;
- direct service integration: 9 tests;
- Chromium: 56 local cases passed, 1 controlled external case passed separately
  against the prior immutable release;
- migrations: API 13, indexer 4, moderation 3; clean application and replay;
- database-enabled coverage: 65.38% statements, 51.91% branches, 59.29%
  functions, 66.54% lines;
- build, lint, typecheck, artifact redaction, and high-severity audit pass;
- eleven Prometheus alert rules validate with `promtool`.

## Recent continuation commits

- `b1f39df` — unique advertised production route contract;
- `85d14e3` — session-derived durable block enforcement in discovery;
- `8d82c1c` — authenticated lifecycle reads and public-status sync recovery;
- `ac377a4` — durable account deactivation and resurrection suppression;
- `702f7f2` — authenticated account data export;
- `d9ef20f` — executable local alpha read-capacity evidence;
- `b382cbd` — isolated browser gate and accessibility audit;
- `be8c435` — closure and final-audit preparation;
- `07994d8` — moderation casework retention;
- `9bf5122` — API private-data retention;
- `6316193` — local recovery and alerting proof;
- `7a4d0de` — immutable staging delivery mechanism;
- `edf2448` — NUC recovery and alerting game days;
- `55b337e` — hardened zero-HIGH/CRITICAL runtime artifact source;
- `e522e5f`, `c013eb6` — production digest deployment and map readiness;
- `995338c` — unique domain/HTTP Prometheus series and current immutable release;
- `83f08c1` — fail-closed mixed staging-capacity evidence gate;
- `3905cda` — bounded five-minute NUC staging-capacity proof;
- `a932ac6` — natural-interval deployed retention scheduler proof;
- `0e20927` — truthful production alpha scope, durable account Settings, and
  expanded accessibility coverage;
- `2dfc9a0`, `40f06b6` — zero-advisory dependency refresh with the production
  runtime launcher retained;
- `e744aea` — persistent staging topology;
- `1892d0b` — durable browser safety and owner actions;
- `49cf598`, `4287596`, `90289f1` — ingestion, projections, discovery.

## Genuine external blockers

The current prerequisite-by-prerequisite verification is recorded in
`external-gate-audit.md`. Disposable browser inputs were supplied for
controlled runs and then destroyed. Signed local registry artifacts and
current/previous manifests now exist; operator approvals remain absent.

1. Formal approval of the implemented backup-aware retention and deactivation
   policy, including the AT-repository deletion boundary.
2. Independent WCAG/assistive-technology review. The sustained deployed
   capacity gate is complete for a bounded 40-RPS aggregate NUC envelope;
   production sizing remains separate hardening work.
3. Named product, engineering, infrastructure, privacy, trust-and-safety, and
   on-call owners.
4. Approval of `project-closure.md` or a replacement go decision.

## Residual risks and next decision

The controlled home runtime proves OAuth/PDS behavior, signed local-registry
deployment, four-image rollback, host configuration, restore, and alert
routing. It does not prove protected GHCR/OIDC promotion, independent backup
or signing-key durability, human response, saturation limits, or production
capacity. Single-region/single-replica home staging is proven only at the
observed 40-RPS aggregate envelope, and fixture-only expansion code remains
frozen but present outside the alpha surface.

Do not launch or recruit participants. Either supply the authorized staging,
OAuth, and ownership inputs and execute the remaining gates, or approve and
execute `project-closure.md`. Local green tests are not an exception.
