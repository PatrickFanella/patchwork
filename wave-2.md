# Parallel Wave 2 Execution Plan (#139)

## 0) Day-0 Alignment (must-do before coding)

Wave 2 issues from #139:

- #98 — Enforce strict production datasource modes and startup guards (blocked by #96, #97)
- #103 — Data retention and deletion policy implementation (blocked by #97)
- #104 — Centralized metrics dashboards and SLI definitions (blocked by #96, #97)
- #106 — Backup/restore/disaster recovery drills (blocked by #96, #97)
- #112 — Moderator operations console MVP and SOPs (blocked by #97)
- #118 — Unified user inbox/dashboard (blocked by #116, #117)
- #130 — Feedback and outcome reporting loop (blocked by #117)
- #129 — Organization/partner portal (blocked by #122, #128)

Before implementation starts:

- Confirm closure evidence for all Wave 2 blockers (#96, #97, #116, #117, #122, #128).
- Set owner + target date for all 8 Wave-2 issues in trackers #68 and #69.
- Add explicit “Wave 2 ready” comments on each issue with blocker link references.

### Branch/PR policy

- 1 issue = 1 primary PR (optional contract/scaffolding PR allowed)
- Target <= 450 net LOC per PR when practical (runtime/infra PRs may exceed this)
- Merge at least once daily per lane to avoid long-lived divergence
- Any PR changing runtime boot guards, retention/deletion logic, or backup flows requires cross-lane review

## 1) Parallel lanes (recommended)

| Lane | Issues | Focus | Primary code/docs touchpoints |
| --- | --- | --- | --- |
| Runtime Guardrails | #98 | Production datasource enforcement + startup readiness/degraded health semantics | `services/api/src/index.ts`, `services/indexer/src/index.ts`, `services/moderation-worker/src/index.ts`, `packages/shared/src/config.ts`, `packages/shared/src/env-file.ts` |
| Data Governance + DR | #103, #106 | Retention/deletion policy + backup/restore drills and runbooks | `services/api/src/db/migrations/`, `services/moderation-worker/src/audit-store.ts`, `services/moderation-worker/src/queue-store.ts`, `docs/privacy/*`, `docs/operations/*`, `docker-compose.postgres.yml` |
| Observability Foundation | #104 | Cross-service SLI metrics and dashboard definitions | `services/api/src/index.ts`, `services/indexer/src/metrics.ts`, `services/moderation-worker/src/metrics.ts`, `docs/operations/sli-slo.md` |
| Moderator Operations | #112 | Moderator queue triage workflow + SOP wiring | `services/moderation-worker/src/moderation-service.ts`, `services/moderation-worker/src/audit-store.ts`, `apps/web/src/features/frontend-shell.tsx`, `apps/web/src/app-shell.ts`, `docs/operations/verification-appeals.md` |
| Product Workflow | #118, #130 | Unified inbox + post-handoff feedback/outcome loop | `apps/web/src/app-shell.ts`, `apps/web/src/feed-ux.ts`, `apps/web/src/chat-ux.ts`, `services/api/src/lifecycle-service.ts`, `services/api/src/chat-service.ts`, `packages/shared/src/lifecycle.ts` |
| Partner Platform | #129 | Organization/partner operations portal | `apps/web/src/org-portal-ux.ts`, `services/api/src/org-portal-service.ts`, `packages/shared/src/org-portal.ts`, `packages/shared/src/contracts.ts` |

> Team-size fallback: combine Observability Foundation with Runtime Guardrails, and combine Partner Platform with Product Workflow.

## 2) Dependency-aware execution order (inside Wave 2)

Wave 2 can run in parallel by unlocking in dependency clusters:

1. **Cluster A (runtime prerequisites met):** #98, #103, #104, #106, #112 once #96 and #97 are verified closed.
2. **Cluster B (product workflow path):** #118 and #130 once #117 is merged (and #116 already closed).
3. **Cluster C (partner path):** #129 once #122 and #128 are merged.

Recommended merge order to minimize integration churn:

1. #98 (startup guards; unblocks Wave 3 #102/#99 path)
2. #104 (SLI/dashboard baseline; dependency for later reliability/release work)
3. #103 (retention/deletion policy and implementation)
4. #106 (backup/restore drills with policy context from #103)
5. #112 (moderator ops MVP; uses durable moderation runtime)
6. #118 (inbox/dashboard)
7. #130 (feedback/outcome loop built on assignment/handoff flow)
8. #129 (org/partner portal after role/verification contracts are stable)

## 3) Suggested 10-day cadence (Wave 2)

### Days 1-2

- Validate blocker closures and contract assumptions across runtime and product lanes.
- Land shared schema/contract updates first (lifecycle/org/metrics primitives).

### Days 3-6

- Runtime lanes complete #98/#104 and start #103/#106 implementation with tests.
- Product lanes complete #118 core inbox and #130 feedback data capture flow.
- Moderator lane completes #112 queue triage UX + SOP baseline.

### Days 7-8

- Partner lane completes #129 against finalized role/verification contracts.
- Cross-lane integration burn-down (health signals, lifecycle timelines, and org permission checks).

### Days 9-10

- Execute full quality gates and Wave 2 closure evidence updates in #68/#69.
- Revalidate blockers for Wave 3 (#99, #102, #105, #107, #113, #123, #127).

## 4) Merge/conflict strategy (important here)

Likely hotspots:

- `services/api/src/lifecycle-service.ts` (#118 and #130 both consume lifecycle transitions)
- `packages/shared/src/contracts.ts` and `packages/shared/src/lifecycle.ts` (cross-lane contract edits)
- `services/moderation-worker/src/moderation-service.ts` (shared by #112 and influenced by #103 retention decisions)
- `apps/web/src/app-shell.ts` / `apps/web/src/features/frontend-shell.tsx` (navigation and dashboard surfacing)

Mitigation:

- One API integrator owns final merge of lifecycle + org portal + feedback contract changes.
- One frontend integrator owns final shell/dashboard/portal stitching.
- Contract-first approach: merge shared contract PRs early; feature PRs should consume contract versions rather than redefining interfaces.

## 5) Verification gates per lane

Run lane checks before opening merge PRs.

### Runtime Guardrails + Data Governance + Observability (#98, #103, #104, #106)

```sh
npm run typecheck -w @patchwork/api
npm run test -w @patchwork/api
npm run test -w @patchwork/indexer
npm run test -w @patchwork/moderation-worker
```

### Moderator Operations (#112)

```sh
npm run test:phase7 -w @patchwork/moderation-worker
npm run test:phase7 -w @patchwork/api
npm run test -w @patchwork/web
```

### Product Workflow + Partner Platform (#118, #130, #129)

```sh
npm run typecheck -w @patchwork/web
npm run test -w @patchwork/web
npm run test:phase8 -w @patchwork/api
npm run test:phase8-e2e
```

### Wave close confidence gate

```sh
npm run check
npm run test:phase7
npm run test:phase8
npm run test:phase8-e2e
npm run test:e2e -w @patchwork/web
```

## 6) Wave 2 done definition (operational)

Wave 2 is complete when:

- All eight issues (#98 #103 #104 #106 #112 #118 #130 #129) are merged or explicitly deferred with rationale.
- Each issue has owner/date + closure notes with links to tests and PRs.
- Trackers #68 and #69 reflect Wave 2 completion state.
- No unresolved blockers remain for Wave 3 start.
- Repository quality gates are green on `main` after final Wave 2 integration merge.
