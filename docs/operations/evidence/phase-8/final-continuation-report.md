# Patchwork continuation status report

Snapshot: 2026-07-11, current `main` worktree

Recommended decision: **NO-GO**

## Completion snapshot

| Phase | Roadmap checklist | Current assessment |
| --- | ---: | --- |
| 1. Authoritative architecture | 14/14 (100%) | Complete; both tasks committed in `23aecd7` |
| 2. Real AT vertical slice | 21/21 (100%) | Direct two-account PDS lifecycle proven |
| 3. Durable state | 18/18 (100%) | Complete locally, including moderation and retention |
| 4. Secure HTTP surface | 18/18 (100%) | Complete locally |
| 5. Live indexer | 17/17 (100%) | Runtime complete; shared live-browser lifecycle remains Phase 6 |
| 6. Integrated web journey | 13/16 (81%) | Real two-account OAuth journey requires authorized state |
| 7. Real staging operations | 9/18 (50%) | Mechanisms complete; deployment and game days unexecuted |
| 8. Evaluation and scope control | 11/14 (79%) | `NO-GO`, expansion frozen, closure prepared; approvals pending |

Raw roadmap completion is 121/136 items (89%). This is not a launch score: the
remaining items are high-weight external gates, so the project is `NO-GO`.

The roadmap's narrow core paths are implemented locally: authentication
adapters, AT CRUD, lifecycle, moderation, HTTP security, ingestion,
projections, discovery, browser commands, deployment mechanisms,
backup/restore, metrics, alerts, and private-data retention have production
paths without fixture fallback. Authenticated account export is now durable;
account deactivation/erasure policy and runtime remain unresolved launch
blockers rather than completed alpha behavior.

## Verification baseline

- database-enabled repository suite: 860 tests;
- PostgreSQL/HTTP integration: 26 tests;
- indexer PostgreSQL projection/reconciliation: 13 tests;
- direct service integration: 9 tests;
- Chromium: 48 passed, 1 authorized-external test skipped;
- migrations: API 12, indexer 3, moderation 3; clean application and replay;
- database-enabled coverage: 65.12% statements, 51.91% branches, 59.11%
  functions, 66.29% lines;
- build, lint, typecheck, artifact redaction, and high-severity audit pass;
- eleven Prometheus alert rules validate with `promtool`.

## Recent continuation commits

- `d9ef20f` — executable local alpha read-capacity evidence;
- `b382cbd` — isolated browser gate and accessibility audit;
- `be8c435` — closure and final-audit preparation;
- `07994d8` — moderation casework retention;
- `9bf5122` — API private-data retention;
- `6316193` — local recovery and alerting proof;
- `7a4d0de` — immutable staging delivery mechanism;
- `e744aea` — persistent staging topology;
- `1892d0b` — durable browser safety and owner actions;
- `49cf598`, `4287596`, `90289f1` — ingestion, projections, discovery.

## Genuine external blockers

1. Authorized staging host, URL, registry, protected environment, and secrets.
2. Two disposable OAuth/PDS browser accounts with redacted storage state.
3. Signed image publication, four-digest deployment, and rollback execution.
4. Restore of a staging backup with measured staging RTO/RPO.
5. Delivered and resolved alerts during indexer and database game days.
6. Formal approval of backup-aware retention and deletion policy.
7. Independent WCAG/assistive-technology review and sustained deployed
   capacity test; the bounded local PostgreSQL read probe is green.
8. Named product, engineering, infrastructure, privacy, trust-and-safety, and
   on-call owners.
9. Approval of `project-closure.md` or a replacement go decision.

## Residual risks and next decision

Local tests cannot prove OAuth metadata, PDS behavior, registry signing, host
configuration, alert delivery, or human response. Single-region/single-replica
staging capacity remains unmeasured, and fixture-only expansion code remains
frozen but present outside the alpha surface.

Do not launch or recruit participants. Either supply the authorized staging,
OAuth, and ownership inputs and execute the remaining gates, or approve and
execute `project-closure.md`. Local green tests are not an exception.
