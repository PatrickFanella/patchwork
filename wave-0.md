# Parallel Wave 0 Execution Plan (#139)

## 0) Day-0 Alignment (must-do before coding)

Normalize dependency contradictions in issue text vs roadmap:

- #139 says Wave 0 has no blockers. But issue bodies include:
  - #120 says "Depends on H1"
  - #131 says "Depends on H3"
- **Action:** In governance lane, update blocker notes so Wave 0 is unambiguous and deadlock-free.
- Assign owners + target dates for all 9 Wave-0 issues in trackers #68 and #69.

### Branch/PR policy

- 1 issue = 1 primary PR (optional prep PR allowed)
- Max PR size target: ~400 LOC net per PR where possible
- Merge at least once daily per lane

## 1) Parallel lanes (recommended)

| Lane | Issues | Focus | Primary code/docs touchpoints |
| --- | --- | --- | --- |
| Governance | #94, #95 | Program structure + ownership | `docs/operations/raci.md` (new), GitHub milestones/board/tracker updates |
| Runtime A | #97 | Durable indexer ingestion/checkpointing | `index.ts`, `pipeline.ts`, `firehose.ts`, `discovery.ts` |
| Runtime B | #96 | Durable moderation queue/audit + idempotency | `index.ts`, `moderation-service.ts`, `moderation.ts` |
| Product Core | #116 | Canonical request lifecycle + transition permissions + timeline | `feed-ux.ts`, `map-ux.ts`, `frontend-shell.tsx`, shared contracts/types |
| Product Account | #120 | Settings + privacy controls center | `frontend-shell.tsx` (new route/nav), API persistence endpoints (service/api area) |
| Product Global UX | #133, #134 | i18n framework + WCAG AA program | `apps/web/src/**`, i18n resources, accessibility regression tests (web + e2e) |
| Product Trust | #131 | Verification tiers/audit lifecycle | volunteer/profile + shared types/contracts + badge UI |

> If team size is smaller, combine Product Account + Trust into one lane and keep Runtime lanes separate.

## 2) Suggested 2-week cadence (Wave 0)

### Days 1–2

- Governance lane closes ownership/milestones/tracker wiring.
- Runtime lanes implement storage abstractions + restart-test scaffolding.
- Product lanes implement skeletons (route/state/contracts), avoid final UI polish.

### Days 3–6

- Runtime #96/#97 complete persistence + metrics + restart/integration tests.
- Product #116/#120/#131/#133/#134 complete core functionality and test coverage.

### Days 7–8

- Integration hardening + merge conflict resolution (especially around `frontend-shell.tsx`).

### Days 9–10

- Full quality gates, issue closure evidence, tracker updates in #68/#69.

## 3) Merge/conflict strategy (important here)

`frontend-shell.tsx` is a hotspot. To parallelize safely:

- One UI integrator owns final route/nav merge for:
  - Lifecycle (#116)
  - Settings (#120)
  - i18n/a11y (#133/#134)
  - Verification surfacing (#131)
- Other lanes work in feature-specific modules first; integrator performs final stitch-up PR.
- Merge order recommendation:
  1. i18n scaffold (#133)
  2. a11y remediations (#134)
  3. Settings (#120)
  4. Lifecycle transitions (#116)
  5. Verification tier UI (#131)

## 4) Verification gates per lane

Use fast lane checks + repo gate before close:

**Runtime lane PRs:**

```sh
npm run test -w @patchwork/indexer
npm run test -w @patchwork/moderation-worker
```

**Product lane PRs:**

```sh
npm run test -w @patchwork/web
npm run test:e2e -w @patchwork/web  # ensure Playwright browser installed
```

**Wave close gate:**

```sh
npm run check && npm run test:phase7
npm run test:phase8  # extra confidence on cross-service behavior
```

## 5) Wave 0 done definition (operational)

Wave 0 is complete when:

- All nine issues (#94 #95 #96 #97 #116 #120 #131 #133 #134) are merged or explicitly deferred with rationale,
- Each has owner/date + closure notes,
- Blockers are consistent across issue bodies and roadmap,
- Trackers #68 and #69 show Wave 0 completion state,
- Quality gates are green.
