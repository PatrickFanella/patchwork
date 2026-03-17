## Plan: Patchwork v1 (AT-Native Mutual Aid Hub) (Vite + React + TypeScript + Tailwind)

Build a web-first, fully AT Protocol-native mutual aid hub with map + feed + 1:1 chat, plus resource directory and volunteer onboarding.

Frontend stack is fixed to **Vite + React + TypeScript + Tailwind CSS**.
Backend stack is fixed to **TypeScript services** (Node.js) because current ATproto app-development tooling is strongest in the TypeScript ecosystem for this use case.

---

## Stack decision (ATproto tooling)

### Chosen backend: TypeScript

Why this is the better fit right now:

1. Bluesky's ATproto reference implementation is TypeScript-first (`bluesky-social/atproto`).
2. ATproto JavaScript libraries provide a direct path for auth/session, XRPC, lexicon-driven validation, and record operations.
3. Shared typing between frontend and backend reduces integration friction (single language across web + API/indexer).
4. Faster team iteration for this project scope than splitting into TS frontend + Go backend.

### Deferred option: Go

Go/Indigo remains a valid future path for high-throughput infra components, but is deferred from v1 to avoid cross-language complexity during product/contract iteration.

---

## Phased execution

1. **Phase 1 — Foundation baseline**
   1.1 Bootstrap monorepo structure and runnable shells:
    - `apps/web` (Vite + React + TypeScript + Tailwind)
    - `services/api` (TypeScript)
    - `services/indexer` (TypeScript)
    - `services/moderation-worker` (TypeScript)

        1.2 Integrate design system into Tailwind and global styles:

    - map color/typography tokens from `design-system.md`
    - implement dark mixed-style primitives (`Button`, `Card`, `Panel`, `Input`, `Badge`, `Link`)
    - enforce focus-visible and reduced-motion baselines

        1.3 Set shared config/env contracts, lint/test/typecheck, and CI gates.

        1.4 Establish domain modules: identity, aid records, geo, feed ranking, messaging, moderation, directory, volunteer onboarding.

2. **Phase 2 — AT Protocol data model and identity** (_depends on 1_)
   2.1 Define/version Lexicon schemas: aid posts, volunteer profile metadata, conversation metadata, moderation/report records, resource-directory records.

    2.2 Implement DID auth/session flow (handle resolution + refresh).

    2.3 Implement record CRUD with schema validation and tombstone/delete handling.

3. **Phase 3 — Firehose ingestion + query layer** (_depends on 2_)
   3.1 Build firehose consumer and normalization pipeline.

    3.2 Implement geo (approximate only), full-text, category/status indexes.

    3.3 Expose query APIs for map/feed/directory with radius/category/urgency/freshness/status filters.

    3.4 Add ranking pipeline (distance band + recency + trust signals).

4. **Phase 4 — Core UX: map + feed + posting** (_depends on 3_)
   4.1 Map UX: clusters, approximate-area rendering, detail drawer, filter chips, “contact helper” CTA.

    4.2 Feed UX: latest/nearby tabs, create/edit/close flows, urgency/status lifecycle.

    4.3 Shared posting form with taxonomy, accessibility tags, and geoprivacy guardrails.

5. **Phase 5 — Chat triage/routing** (_depends on 2 and 3_)
   5.1 Post-linked 1:1 chat initiation.

    5.2 Deterministic routing assistant (post author vs volunteer pool vs verified resource).

    5.3 Persist conversation metadata on-protocol with recipient-capability fallback.

    5.4 Add safety controls: report/block/mute, abuse keyword flags, rate limiting.

6. **Phase 6 — Resource directory + volunteer onboarding** (_depends on 3; UI can run parallel with 4/5_)
   6.1 Resource directory records + map overlays + operational metadata.

    6.2 Volunteer onboarding, skills/availability, verification checkpoints, match preferences.

7. **Phase 7 — Moderation, trust, privacy hardening** (_depends on 4/5/6_)
   7.1 Moderation queues and policy actions.

    7.2 Anti-spam controls for post/chat.

    7.3 Geoprivacy precision limits, redaction, minimal logging.

8. **Phase 8 — Verification and pilot rollout** (_depends on 1-7_)
   8.1 Contract, ingestion, ranking, privacy, and routing test matrix.

    8.2 E2E flows: create request → discover → chat → handoff.

    8.3 Observability/alerts/SLA dashboard/incident playbook.

    8.4 One-region pilot + go/no-go review.

---

## Target file map

- `apps/web/package.json` — Vite React TS app scripts/deps.
- `apps/web/tailwind.config.ts` — Tailwind token mapping from design system.
- `apps/web/src/styles/tokens.css` — CSS variables aligned with `design-system.md`.
- `apps/web/src/features/*` — map/feed/posting/chat/resource/volunteer UI modules.
- `services/api/src/*` — query/auth/record APIs.
- `services/indexer/src/*` — firehose ingestion, indexing, ranking.
- `services/moderation-worker/src/*` — moderation and anti-abuse pipelines.
- `packages/at-lexicons/*.json` — lexicon contracts.
- `packages/shared/src/*` — shared types, validation, privacy helpers.
- `.github/workflows/ci.yml` — lint/test/typecheck and integration checks.

---

## Verification gates

1. AT record contracts pass validation + round-trip tests.
2. Firehose replay is deterministic and honors tombstones/deletes.
3. Public APIs never expose exact coordinates.
4. Query and ranking outputs satisfy deterministic expectations.
5. Chat routing and safety controls are validated by scenario tests.
6. Browser E2E for request lifecycle passes in CI.

---

## v1 scope decisions

- Included: web-only launch, AT-native identity/records, map+feed+posting, 1:1 post-linked chat, resource directory, volunteer onboarding, privacy-first geolocation.
- Excluded: native mobile apps, public group chats, advanced reputation marketplace, multi-region launch.
- Deferred: Go backend migration/split unless scale constraints or infra benchmarks justify it post-pilot.
