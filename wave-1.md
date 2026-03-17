# Parallel Wave 1 Execution Plan (#139)

## 0) Day-0 Alignment (must-do before coding)

Wave 1 issues from #139:

- #100 — Secrets management hardening (blocked by #94)
- #101 — Supply-chain and container security gates in CI (blocked by #94)
- #117 — Assignment and handoff workflow (blocked by #116)
- #121 — Account settings and privacy controls center (blocked by #120)
- #122 — Role and capability model (blocked by #120)
- #128 — Verification tiers for volunteers and organizations (blocked by #122)
- #119 — Attachment support for requests and handoffs (blocked by #116)

Before implementation starts:

- Confirm blocker closure evidence exists in linked issues (#94, #116, #120).
- Set owner + target date for all 7 Wave-1 issues in trackers #68 and #69.
- Add explicit “ready for Wave 1” comments to each issue, including dependency references.

### Branch/PR policy

- 1 issue = 1 primary PR (optional prep PR allowed for schema/test scaffolding)
- Target <= 400 net LOC per PR when practical
- Merge at least once daily per lane to limit drift
- PRs touching security/authz require at least one cross-lane reviewer

## 1) Parallel lanes (recommended)

| Lane | Issues | Focus | Primary code/docs touchpoints |
| --- | --- | --- | --- |
| Security Foundations | #100, #101 | Secret handling + CI/container policy enforcement | `Dockerfile`, `docker-compose.yml`, `docker-compose.postgres.yml`, `.github/workflows/ci.yml`, `docs/operations/*` |
| Lifecycle Workflow | #117, #119 | Assignment/handoff + attachment flow | `services/api/src/lifecycle-service.ts`, `services/api/src/aid-post-service.ts`, `apps/web/src/feed-ux.ts`, `apps/web/src/map-ux.ts`, `apps/web/src/posting-form.ts` |
| Account + Authorization | #121, #122 | Settings/privacy controls + role/capability enforcement | `services/api/src/settings-service.ts`, `services/api/src/chat-service.ts`, `services/api/src/lifecycle-service.ts`, `apps/web/src/settings-ux.ts`, `packages/shared/src/*` |
| Verification Trust | #128 | Tiered verification UX + policy/audit behavior | `services/api/src/verification-service.ts`, `apps/web/src/verification-ux.ts`, `packages/shared/src/*` |

> Team-size fallback: combine Verification Trust into Account + Authorization if staffing is limited.

## 2) Dependency-aware execution order (inside Wave 1)

Parallel execution is safe with dependency gates:

1. Start immediately (after blocker confirmation): #100, #101, #117, #119, #121, #122
2. Start #128 only after #122 role/capability contract is merged (or finalized behind a shared feature-contract PR).

Recommended merge order to reduce conflict risk:

1. #101 (CI/security gates) — low product conflict, early enforcement value
2. #100 (secrets hardening) — infrastructure + runtime safety baseline
3. #122 (role/capability model) — unblocks #128 and de-risks authz regressions
4. #121 (settings/privacy center) — consumes role/capability checks where needed
5. #117 (assignment/handoff workflow)
6. #119 (attachments for requests/handoffs)
7. #128 (verification tiers)

## 3) Suggested 10-day cadence (Wave 1)

### Days 1-2

- Security lane: threat model + CI gate scaffolding + secret inventory.
- Product lanes: finalize API contracts (assignment transitions, attachment metadata, role/capability matrix, verification tier schema).

### Days 3-6

- #100/#101 implemented with CI passing and rollback notes documented.
- #117/#119 core flows implemented with deterministic service tests and UI interaction tests.
- #121/#122 role-aware settings paths merged or feature-flagged.

### Days 7-8

- #128 implementation on top of finalized #122 contract.
- Cross-lane integration and conflict burn-down (especially `lifecycle-service.ts`, shared role checks, and request UX surfaces).

### Days 9-10

- Full quality gates, issue closure evidence, and tracker updates in #68/#69.
- Blocker graph revalidation for Wave 2 readiness.

## 4) Merge/conflict strategy (important here)

Hotspots likely to conflict:

- `services/api/src/lifecycle-service.ts` (issues #117, #122, #119 interactions)
- `apps/web/src/feed-ux.ts` and `apps/web/src/map-ux.ts` (assignment + attachment state rendering)
- `packages/shared/src/*` authorization and contract types consumed by #121/#122/#128

Mitigation:

- Nominate one API integrator for final lifecycle/authz merge.
- Nominate one web integrator for final UX stitching across feed/map/posting/settings/verification surfaces.
- Land shared contracts early; lane work should consume contracts rather than redefining them.

## 5) Verification gates per lane

Use lane-local checks before opening merge PRs.

### Security Foundations (#100, #101)

```sh
npm run check
npm run test:phase7
```

### Lifecycle Workflow + Account/AuthZ + Verification (#117, #119, #121, #122, #128)

```sh
npm run typecheck -w @patchwork/web
npm run test -w @patchwork/web
npm run test -w @patchwork/api
npm run test:phase8 -w @patchwork/api
```

### Browser/E2E confidence for wave close

```sh
npm run test:phase8-e2e
npm run test:e2e -w @patchwork/web
```

## 6) Wave 1 done definition (operational)

Wave 1 is complete when:

- All seven issues (#100 #101 #117 #119 #121 #122 #128) are merged or explicitly deferred with rationale.
- Each issue has owner/date + closure notes with links to tests and PRs.
- Trackers #68 and #69 reflect Wave 1 completion state.
- No unresolved blockers remain for Wave 2 start.
- Repository quality gates are green on `main` after final integration merge.
