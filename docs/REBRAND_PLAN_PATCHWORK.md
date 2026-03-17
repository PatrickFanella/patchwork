# Patchwork Rebrand Plan (Full Stack + Protocol)

This plan covers a **complete** rebrand from Mutual Hub → Patchwork across product copy, code, package scopes, deployment artifacts, and AT protocol identifiers.

## Goals

- Present one coherent brand: **Patchwork**.
- Keep production/staging stability during migration.
- Complete hard cutover to `app.patchwork.*` with no legacy namespace compatibility paths.

## Current-state findings (high impact)

- User-facing branding is migrated to Patchwork across README, web title, and app shell labels.
- npm workspace/package scope and import paths are migrated to `@patchwork/*`.
- Root scripts, CI invocations, and Docker workspace targets now reference `@patchwork/*`.
- AT lexicon NSIDs are now `app.patchwork.*`; any remaining legacy namespace references should be removed.
  - `packages/at-lexicons/src/validators.ts`
  - `packages/at-lexicons/src/versioning.ts`
  - `packages/at-lexicons/src/lexicons/*.json`
  - fixtures/tests referencing `$type` or URIs.
- Docker/deploy naming is aligned to Patchwork service/container names.
- Postgres runtime identifiers are migrated to `patchwork` in compose and env defaults.

## Naming decisions to lock before implementation

1. **Package scope**: use `@patchwork/*` (recommended).
2. **Indexer naming model**:
   - Option A (recommended now): keep one code package (`@patchwork/indexer`) and use Spool/Quilt as role aliases.
   - Option B (later): split into two services (`@patchwork/spool`, `@patchwork/quilt`).
3. **Moderation service name**: standardize on `Thimble` for brand consistency.
4. **Protocol namespace strategy**:
   - hard cutover to `app.patchwork.*` only.

## Phased rollout

## Phase 0 — Decision + safety prep

- Create ADR for naming and migration policy.
- Announce freeze window for concurrent refactors touching imports/lexicons.
- Confirm no compatibility flags remain for legacy namespaces.

Exit criteria:

- ADR merged.
- Namespace policy documented and enforced in code/tests.

## Phase 1 — Complete non-breaking brand layer

- Finalize docs and product copy to Patchwork.
- Align local/dev compose naming where safe (labels/container names/volume names) while preserving DB connectivity.
- Ensure README/quality docs consistently reference new naming decisions.

Exit criteria:

- No `Mutual Hub` user-facing strings remain.
- Docs pass quick consistency review.

## Phase 2 — Package scope + import migration (code-level)

- Rename package names:
  - `@mutual-hub/web` → `@patchwork/web`
  - `@mutual-hub/api` → `@patchwork/api`
  - `@mutual-hub/indexer` → `@patchwork/indexer` (or `@patchwork/spool` if chosen)
  - `@mutual-hub/moderation-worker` → `@patchwork/thimble` (or `@patchwork/moderation-worker`)
  - `@mutual-hub/shared` → `@patchwork/shared`
  - `@mutual-hub/at-lexicons` → `@patchwork/at-lexicons`
- Update all import paths and workspace script references.
- Update TS path aliases and Vite aliases.
- Update CI and Dockerfile `-w` workspace invocations.

Exit criteria:

- `grep` shows no `@mutual-hub/` references.
- Lint/typecheck/tests green in CI.

## Phase 3 — Runtime/deploy naming coherence

- Align compose files (`docker-compose.yml` + `docker-compose.postgres.yml`) and env examples.
- DB identifiers are now `patchwork` in local/deploy compose defaults.
- Preserve rollout note: existing local DB volumes seeded under legacy names may require a fresh seed.

Exit criteria:

- Local dev up/down and seed commands work with updated names.
- Deployment manifests and runtime args are consistent.

## Phase 4 — AT lexicon namespace migration (hard cutover)

- Introduce new NSIDs in lexicons and validators:
  - `app.patchwork.aid.post`, etc.
- Enforce only `app.patchwork.*` NSIDs in lexicons, validators, fixtures, and tests.
- Remove legacy namespace lexicon files and references.
- Update all record URIs, contract fixtures, and docs to `app.patchwork.*`.

Exit criteria:

- Ingestion/query/chat/moderation flows succeed with `app.patchwork.*` only.
- `grep` confirms no legacy namespace references remain.

## Phase 5 — Cleanup and deprecation

- Delete old references in docs/tests/scripts.
- Publish final migration notes.

Exit criteria:

- No `mutualhub` NSID references remain in active code paths.
- All quality gates and e2e pass.

## Risk register and mitigation

1. **Breaking imports/workspace scripts**
   - Mitigation: do Phase 2 in a single PR with full repo-wide replacement and CI gate.
2. **NSID data incompatibility**
   - Mitigation: one-time hard cutover with repo-wide validation and fixtures aligned.
3. **Compose/runtime drift**
   - Mitigation: same PR updates compose, Dockerfile, README, and `.env.example` together.
4. **Indexer naming ambiguity (Spool/Quilt)**
   - Mitigation: lock one decision in ADR before renaming packages.

## Execution checklist (operator view)

- [ ] ADR approved (naming map + NSID migration policy)
- [x] Phase 1 copy/docs complete
- [x] Phase 2 package/import migration merged
- [x] Phase 3 runtime/deploy naming aligned
- [ ] Phase 4 NSID hard cutover deployed
- [ ] Phase 5 legacy cleanup complete

## Acceptance criteria (definition of done)

- Product/UI/docs consistently say Patchwork.
- Codebase has no `@mutual-hub/*` imports or workspace references.
- Runtime/deploy artifacts use chosen Patchwork naming consistently.
- AT protocol namespace migration completed with hard cutover and no legacy references.
- CI quality gates and E2E suites pass after each migration phase.
