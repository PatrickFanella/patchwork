# Parallel Wave 5 Execution Plan (#139)

## 0) Day-0 Alignment (must-do before coding)

Wave 5 issues from #139:

- #126 — Product/I2: Add public/private group coordination spaces
- #132 — Product/L1: Build explainable smart matching assistant
- #135 — Product/K2: Define and execute native mobile app first release

Before implementation starts:

- Confirm closure evidence for upstream blockers from Waves 3-4 (at minimum: #122, #123, #124, #125, #127, #130, #131).
- Reconcile dependency mismatches between #139 and child issue bodies for all Wave 5 issues, then post authoritative blocker notes directly on #126, #132, and #135.
- Set owner + target date for all 3 Wave-5 issues in tracker #69.
- Add explicit “Wave 5 ready” comments on each issue with dependency links and rollout-risk notes.

### Branch/PR policy

- 1 issue = 1 primary PR (optional prep PR allowed for shared contracts and mobile scaffold)
- Target <= 500 net LOC per PR when practical
- Merge at least once daily per lane to keep contract drift low
- Any PR changing routing/ranking logic, group moderation controls, or mobile auth/session flows requires cross-lane reviewer signoff

## 1) Parallel lanes (recommended)

| Lane | Issues | Focus | Primary code/docs touchpoints |
| --- | --- | --- | --- |
| Group Coordination | #126 | Group channels, membership controls, request-linked rooms, moderation hooks | `services/api/src/chat-service.ts`, `services/api/src/lifecycle-service.ts`, `apps/web/src/chat-ux.ts`, `apps/web/src/inbox-ux.ts`, `packages/shared/src/contracts.ts` |
| Matching Intelligence | #132 | Explainable recommendations, operator overrides, feedback loops | `services/api/src/lifecycle-service.ts`, `services/api/src/chat-service.ts`, `apps/web/src/discovery-primitives.ts`, `apps/web/src/feed-ux.ts`, `packages/shared/src/contracts.ts` |
| Mobile First Release | #135 | Mobile architecture decision, shared contracts, QA/release checklist | `packages/shared/src/contracts.ts`, `docs/architecture/domain-map.md`, `docs/architecture/service-boundaries.md`, `docs/operations/production-readiness-board.md`, `apps/mobile/` (new) |

> Team-size fallback: combine Group Coordination and Matching Intelligence into one backend+web lane, then run Mobile First Release after contracts stabilize.

## 2) Dependency-aware execution order (inside Wave 5)

Wave 5 can run in parallel by dependency cluster:

1. **Cluster A (dependency normalization gate):** finalize one authoritative blocker graph for #126/#132/#135 before coding against assumptions.
2. **Cluster B (collaboration base):** #126 once chat+capability prerequisites are closed and verified.
3. **Cluster C (recommendation base):** #132 once scheduling and trust prerequisites are closed.
4. **Cluster D (mobile release base):** #135 once notification/offline and contract prerequisites are closed.

Recommended merge order to minimize integration churn:

1. Shared contracts/scaffold prep PR (optional but recommended)
2. #126 (group coordination spaces)
3. #132 (explainable smart matching)
4. #135 (native mobile first release)

## 3) Suggested 10-day cadence (Wave 5)

### Days 1-2

- Resolve roadmap/issue dependency mismatches and lock a single blocker graph in comments.
- Land shared contract/event-model deltas and mobile architecture decision record.

### Days 3-5

- Group Coordination lane completes #126 core channel/membership/room flows.
- Matching lane implements recommendation schema + explanation trace primitives.

### Days 6-7

- Matching lane completes #132 operator override and feedback loop behavior.
- Mobile lane scaffolds client structure and contract consumption path.

### Days 8-10

- Mobile lane completes #135 core flow parity validation and QA matrix evidence.
- Execute quality gates and update closure evidence in #69.
- Revalidate Wave 6/Wave 7 downstream blockers (#114, #115, #137).

## 4) Merge/conflict strategy (important here)

Likely hotspots:

- `packages/shared/src/contracts.ts` (group, matching, and mobile contract convergence)
- `services/api/src/lifecycle-service.ts` (shared lifecycle and routing signals)
- `services/api/src/chat-service.ts` (group context + recommendation-relevant behavior)
- `apps/web/src/chat-ux.ts`, `apps/web/src/inbox-ux.ts`, and `apps/web/src/feed-ux.ts` (group + recommendation surfacing)

Mitigation:

- One API integrator owns final shared-contract and lifecycle merge.
- One web integrator owns final group/recommendation UX stitching.
- One mobile integrator owns contract compatibility and release checklist.
- Contract-first approach: merge schema/contracts early; feature PRs should consume those versions rather than redefining interfaces.

## 5) Verification gates per lane

Run lane checks before opening merge PRs.

### Group Coordination + Matching Intelligence (#126, #132)

```sh
npm run typecheck -w @patchwork/web
npm run test -w @patchwork/web
npm run test:phase8 -w @patchwork/api
npm run test -w @patchwork/api
```

### Mobile First Release (#135)

```sh
npm run typecheck -w @patchwork/shared
npm run test:e2e -w @patchwork/web
```

### Wave close confidence gate

```sh
npm run check
npm run test:phase8
npm run test:phase8-e2e
npm run test:e2e -w @patchwork/web
```

## 6) Wave 5 done definition (operational)

Wave 5 is complete when:

- All three issues (#126 #132 #135) are merged or explicitly deferred with rationale.
- Each issue has owner/date + closure notes with links to tests and PRs.
- Dependency notes are normalized between #139 and child issue bodies.
- Tracker #69 reflects Wave 5 completion state.
- No unresolved blockers remain for Wave 6/Wave 7 start.
- Repository quality gates are green on `main` after final Wave-5 integration merge.
