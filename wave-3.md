# Parallel Wave 3 Execution Plan (#139)

## 0) Day-0 Alignment (must-do before coding)

Wave 3 issues from #139:

- #99 — Production/B4: Add E2E contract path against production-like dependencies
- #102 — Production/D1: Build centralized metrics dashboards and SLI definitions
- #105 — Production/D4: Create incident response runbook and execute game day
- #107 — Production/D3: Implement backup, restore, and disaster recovery drills
- #113 — Production/F2: Publish legal and policy readiness pack
- #123 — Product/H3: Implement role and capability model
- #127 — Product/J1: Implement reputation and reliability scoring

Before implementation starts:

- Confirm closure evidence for upstream blockers from Waves 1-2 (at minimum: #98, #103, #104, #106, #117, #118, #120, #122).
- Reconcile dependency inconsistencies between roadmap text and child issue bodies (notably #102/#105/#107), then add authoritative blocker notes directly on the child issues.
- Set owner + target date for all 7 Wave-3 issues in trackers #68 and #69.
- Add explicit “Wave 3 ready” comments on each issue with dependency links.

### Branch/PR policy

- 1 issue = 1 primary PR (optional prep PR for shared contracts/test scaffolding)
- Target <= 450 net LOC per PR when practical
- Merge at least once daily per lane
- PRs touching authz, runtime/incident controls, or legal policy pages require cross-lane reviewer signoff

## 1) Parallel lanes (recommended)

| Lane | Issues | Focus | Primary code/docs touchpoints |
| --- | --- | --- | --- |
| Production Contract Validation | #99 | Production-like E2E path with persistent dependencies | `.github/workflows/ci.yml`, `docker-compose.postgres.yml`, `apps/web/e2e/request-lifecycle.test.ts`, `apps/web/e2e/accessibility.spec.ts`, `docs/test-traceability.md` |
| Reliability + Operations | #102, #105, #107 | SLI dashboards, incident process, DR confidence drills | `docs/operations/sli-slo.md`, `docs/operations/alerting-policy.md`, `docs/operations/production-readiness-board.md`, `services/api/src/index.ts`, `services/indexer/src/metrics.ts`, `services/moderation-worker/src/metrics.ts` |
| Legal + Policy Surface | #113 | Public policy pack + changelog/governance path | `docs/patchwork.md`, `docs/operations/raci.md`, `apps/web/src/app-shell.ts`, `apps/web/src/settings-ux.ts` |
| Authorization Platform | #123 | Role/capability matrix + API/UI enforcement | `packages/shared/src/contracts.ts`, `services/api/src/lifecycle-service.ts`, `services/api/src/chat-service.ts`, `services/api/src/settings-service.ts`, `apps/web/src/app-shell.ts`, `apps/web/src/settings-ux.ts` |
| Reputation Engine | #127 | Explainable, abuse-resistant reputation scoring | `services/api/src/lifecycle-service.ts`, `services/api/src/chat-service.ts`, `packages/shared/src/contracts.ts`, `apps/web/src/discovery-primitives.ts`, `apps/web/src/feed-ux.ts` |

> Team-size fallback: combine Legal + Policy Surface into Reliability + Operations, and run Reputation Engine after Authorization Platform stabilizes.

## 2) Dependency-aware execution order (inside Wave 3)

Wave 3 can run in parallel by dependency cluster:

1. **Cluster A (Wave-2 closure gate):** #99, #102, #113 after runtime/security prerequisites are confirmed closed.
2. **Cluster B (authorization gate):** #123 after account/inbox prerequisites are closed (#118 + #120, and #121 if still open).
3. **Cluster C (trust scoring gate):** #127 after #123 and collaboration prerequisites are stable (#117/#122).

Recommended merge order to reduce churn and blocker confusion:

1. #102 (SLI/dashboard baseline)
2. #99 (production-like E2E contract path)
3. #113 (legal/policy pack)
4. #123 (role/capability model)
5. #127 (reputation/reliability scoring)
6. #107 (backup/restore drills with measured evidence)
7. #105 (incident runbook + game day after alerting/DR evidence)

## 3) Suggested 10-day cadence (Wave 3)

### Days 1-2

- Resolve dependency mismatches and lock authoritative blocker graph in issue comments.
- Land shared contract/schema deltas early (authorization + scoring primitives).

### Days 3-6

- Production lanes complete #102 and #99 with deterministic CI diagnostics.
- Product lanes complete #123 authorization enforcement and begin #127 scoring baseline.
- Policy lane completes #113 page content/versioning and app discoverability links.

### Days 7-8

- Reliability lane completes #107 drill execution + RTO/RPO evidence.
- Ops lane completes #105 game day + retrospective issue capture.
- Cross-lane integration burn-down for authz guards, SLI ownership, and policy discoverability.

### Days 9-10

- Run full quality gates and attach closure evidence to #68/#69.
- Revalidate Wave 4 blockers (#108, #109, #110, #111, #124, #125, #136, #138).

## 4) Merge/conflict strategy (important here)

Likely hotspots:

- `.github/workflows/ci.yml` (new E2E/runtime matrix for #99)
- `packages/shared/src/contracts.ts` (shared authz/scoring contract edits)
- `services/api/src/lifecycle-service.ts` (authorization and scoring signal dependencies)
- `apps/web/src/app-shell.ts` and `apps/web/src/settings-ux.ts` (policy + role-aware UI surfacing)
- `docs/operations/sli-slo.md` and alerting/incident docs (multi-issue operational updates)

Mitigation:

- One backend integrator owns shared contract + lifecycle merges.
- One frontend integrator owns shell/settings/policy link consistency.
- One operations integrator owns SLI/alerting/incident + DR runbook consistency.
- Merge contract/doc scaffolding first, then lane feature PRs consume those artifacts.

## 5) Verification gates per lane

Run lane checks before merge PRs.

### Production Contract Validation (#99)

```sh
npm run test:phase8-e2e
npm run test:e2e -w @patchwork/web
```

### Reliability + Operations (#102, #105, #107)

```sh
npm run test -w @patchwork/api
npm run test -w @patchwork/indexer
npm run test -w @patchwork/moderation-worker
```

### Authorization + Reputation + Policy (#123, #127, #113)

```sh
npm run typecheck -w @patchwork/web
npm run test -w @patchwork/web
npm run test:phase8 -w @patchwork/api
```

### Wave close confidence gate

```sh
npm run check
npm run test:phase7
npm run test:phase8
npm run test:phase8-e2e
npm run test:e2e -w @patchwork/web
```

## 6) Wave 3 done definition (operational)

Wave 3 is complete when:

- All seven issues (#99 #102 #105 #107 #113 #123 #127) are merged or explicitly deferred with rationale.
- Each issue has owner/date + closure notes with links to tests and PRs.
- Dependency notes are normalized between #139 and child issue bodies.
- Trackers #68 and #69 reflect Wave 3 completion state.
- No unresolved blockers remain for Wave 4 start.
- Repository quality gates are green on `main` after final Wave-3 integration merge.
