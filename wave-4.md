# Parallel Wave 4 Execution Plan (#139)

## 0) Day-0 Alignment (must-do before coding)

Wave 4 issues from #139:

- #108 — Production/E1: Introduce staging environment parity with production
- #111 — Production/E4: Run performance and scale validation
- #109 — Production/E2: Implement immutable image versioning and rollback strategy
- #110 — Production/E3: Implement progressive delivery (canary or weighted rollout)
- #124 — Product/I3: Implement notifications center and delivery channels
- #125 — Product/I4: Add calendar and volunteer shift scheduling
- #136 — Product/L3: Implement multi-region tenant support
- #138 — Product/L4: Create integrations marketplace and connector framework

Before implementation starts:

- Confirm closure evidence for all Wave 4 blockers from Waves 2-3 (at minimum: #99, #100, #104, #105, #122, #123, #129, #130).
- Normalize dependency mismatches between #139 and child issue bodies (notably #124/#125/#136/#138) and add authoritative blocker notes on each issue.
- Set owner + target date for all 8 Wave-4 issues in trackers #68 and #69.
- Add explicit “Wave 4 ready” comments to each issue with blocker links and rollback plan expectations.

### Branch/PR policy

- 1 issue = 1 primary PR (optional prep PR allowed for contracts, infra modules, or test harnesses)
- Target <= 500 net LOC per PR when practical (release engineering PRs may exceed this)
- Merge at least once daily per lane to keep release and product tracks convergent
- Any PR changing deploy strategy, rollout guardrails, or scheduling/notification delivery behavior requires cross-lane review

## 1) Parallel lanes (recommended)

| Lane | Issues | Focus | Primary code/docs touchpoints |
| --- | --- | --- | --- |
| Release Environment & Promotion | #108, #109, #110 | Staging parity, immutable artifacts, progressive rollout controls | `.github/workflows/ci.yml`, `docker-compose.yml`, `docker-compose.postgres.yml`, `Dockerfile`, `Makefile`, `docs/operations/production-readiness-board.md`, `docs/operations/alerting-policy.md` |
| Performance & Capacity | #111 | Load/perf validation and safe operating envelope | `apps/web/e2e/request-lifecycle.test.ts`, `apps/web/e2e/accessibility.spec.ts`, `services/api/src/index.ts`, `services/indexer/src/metrics.ts`, `services/moderation-worker/src/metrics.ts`, `docs/operations/sli-slo.md` |
| Collaboration Delivery | #124, #125 | Notification center/channels + shift scheduling workflow | `apps/web/src/inbox-ux.ts`, `apps/web/src/chat-ux.ts`, `apps/web/src/feed-ux.ts`, `services/api/src/chat-service.ts`, `services/api/src/lifecycle-service.ts`, `packages/shared/src/lifecycle.ts` |
| Scale & Integrations Platform | #136, #138 | Multi-region tenancy scaffolding + connector framework | `services/api/src/index.ts`, `packages/shared/src/contracts.ts`, `docs/architecture/service-boundaries.md`, `docs/architecture/domain-map.md`, `docs/operations/sli-slo.md` |

> Team-size fallback: combine Performance & Capacity into Release Environment, and split Scale & Integrations into architecture-first prep plus a smaller connector MVP.

## 2) Dependency-aware execution order (inside Wave 4)

Wave 4 can run in parallel by dependency cluster:

1. **Cluster A (release baseline):** #108 and #111 once Wave-3 runtime/reliability prerequisites are verified closed.
2. **Cluster B (promotion chain):** #109 after #108, then #110 after #109 and incident/alert readiness closure.
3. **Cluster C (collaboration chain):** #124 after role/chat prerequisites are stable; #125 after #124 and role/capability enforcement.
4. **Cluster D (platform scale chain):** #136 after offline/runtime prerequisites are closed; #138 after partner + scheduling dependencies are stable.

Recommended merge order to minimize integration churn:

1. #108 (staging parity baseline)
2. #111 (capacity baseline against parity environment)
3. #109 (immutable image + rollback controls)
4. #124 (notifications center and channel adapters)
5. #125 (shift scheduling on top of notification events)
6. #110 (progressive rollout with alert-triggered rollback)
7. #136 (multi-region tenant scaffolding and routing controls)
8. #138 (connector framework after scheduling + partner dependencies)

## 3) Suggested 10-day cadence (Wave 4)

### Days 1-2

- Resolve blocker mismatches and freeze authoritative dependency graph in issue comments.
- Land shared infra primitives (artifact metadata, env topology schema, rollout policy contracts).

### Days 3-6

- Release lane completes #108 and #109 core implementation with staging promotion checks.
- Performance lane completes #111 test profiles and baseline capacity report.
- Product lane completes #124 notification center and channel preference flows.

### Days 7-8

- Product lane completes #125 shift scheduling + reminder/conflict handling.
- Release lane completes #110 progressive rollout and rollback trigger integration.
- Platform lane lands #136 architecture/runtime slices and starts #138 connector framework skeleton.

### Days 9-10

- Platform lane completes #138 first production-like connectors and audit/retry behavior.
- Execute full quality gates, update #68/#69 closure evidence, and revalidate Wave 5 blockers (#126, #132, #135).

## 4) Merge/conflict strategy (important here)

Likely hotspots:

- `.github/workflows/ci.yml` (staging promotion, immutable artifact, rollout verification, perf jobs)
- `docker-compose.yml` / `docker-compose.postgres.yml` / `Dockerfile` (environment parity and release flows)
- `services/api/src/lifecycle-service.ts` and `services/api/src/chat-service.ts` (#124/#125 event and delivery coupling)
- `packages/shared/src/contracts.ts` and `packages/shared/src/lifecycle.ts` (notification/scheduling/integration contract edits)
- `apps/web/src/app-shell.ts` and `apps/web/src/inbox-ux.ts` (notification center + scheduling navigation surfaces)

Mitigation:

- One release integrator owns final deployment/promotion pipeline merges.
- One product integrator owns final inbox/notification/scheduling UX stitching.
- One platform integrator owns multi-region + connector contract evolution.
- Contract-first strategy: merge shared contract and event model PRs first; feature PRs consume contracts rather than redefining types.

## 5) Verification gates per lane

Run lane-local checks before opening merge PRs.

### Release Environment & Promotion (#108, #109, #110)

```sh
npm run check
npm run test:phase7
```

### Performance & Capacity (#111)

```sh
npm run test:phase8
npm run test:phase8-e2e
```

### Collaboration Delivery (#124, #125)

```sh
npm run typecheck -w @patchwork/web
npm run test -w @patchwork/web
npm run test:phase8 -w @patchwork/api
```

### Scale & Integrations Platform (#136, #138)

```sh
npm run test -w @patchwork/api
npm run test -w @patchwork/indexer
npm run typecheck -w @patchwork/shared
```

### Wave close confidence gate

```sh
npm run check
npm run test:phase7
npm run test:phase8
npm run test:phase8-e2e
npm run test:e2e -w @patchwork/web
```

## 6) Wave 4 done definition (operational)

Wave 4 is complete when:

- All eight issues (#108 #111 #109 #110 #124 #125 #136 #138) are merged or explicitly deferred with rationale.
- Each issue has owner/date + closure notes with links to tests and PRs.
- Dependency notes are normalized between #139 and child issue bodies.
- Trackers #68 and #69 reflect Wave 4 completion state.
- No unresolved blockers remain for Wave 5 start.
- Repository quality gates are green on `main` after final Wave-4 integration merge.
