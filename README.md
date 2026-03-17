# Patchwork

AT Protocol-native mutual aid platform with a web client, query API, ingestion/indexing pipeline, and moderation worker.

This monorepo is designed for fast local development with deterministic fixtures, strong type contracts, and CI quality gates.

## What’s in this repo

- `apps/web` — Vite + React + TypeScript + Tailwind frontend
- `services/api` — HTTP API for query/chat/volunteer flows
- `services/indexer` — ingestion + indexing service
- `services/moderation-worker` — moderation/trust-safety worker
- `packages/shared` — shared contracts, config/env schemas, utilities
- `packages/at-lexicons` — AT lexicon schemas, fixtures, and validators

## Patchwork component naming

- **Patchwork Web** — client (`patchwork-web`)
- **Patchwork API** — query + auth (`patchwork-api`)
- **Spool** — ingestion + queueing (`patchwork-spool`)
- **Quilt** — indexing + search layer (network alias on `patchwork-spool`: `patchwork-quilt`)
- **Stitch** — chat service (network alias on `patchwork-api`: `patchwork-stitch`)
- **Thimble** — moderation worker (`patchwork-thimble`)

## Tech stack

- Node.js + TypeScript (monorepo workspaces)
- React + Vite + Tailwind (web)
- Vitest + Playwright (unit + browser E2E)
- Optional local Postgres for API datasource mode

## Prerequisites

- Node.js `>=20.19.0`
- npm
- Docker (only needed for Postgres mode)

## Quick start

1. Install dependencies: `npm ci`
2. Create local env file: copy `.env.example` → `.env`
3. Start the app surfaces you need:
    - Web: `npm run dev:web`
    - API: `npm run dev:api`
    - Indexer: `npm run dev:indexer`
    - Moderation worker: `npm run dev:moderation`

Default local URLs:

- Web: `http://localhost:5173`
- API health: `http://localhost:4000/health`
- Indexer health: `http://localhost:4100/health`
- Moderation health: `http://localhost:4200/health`

## API datasource modes

The API supports two datasource modes:

- `fixture` (default): deterministic in-memory data for local development
- `postgres`: local DB-backed mode for integration testing

### Postgres mode

1. Start Postgres: `npm run db:up`
2. Set in `.env`:
    - `API_DATA_SOURCE=postgres`
    - `API_DATABASE_URL=postgresql://patchwork:patchwork@localhost:5432/patchwork`
3. Seed deterministic data: `npm run db:seed`
4. Start API in postgres mode: `npm run dev:api:postgres`

### DB-backed frontend mode (Map / Feed / Resources / Posting)

The web client now calls API routes directly for discovery + posting surfaces:

- `GET /query/map`
- `GET /query/feed`
- `GET /query/directory`
- `GET /aid/post/create`

Recommended local flow:

1. Start Postgres: `npm run db:up`
2. Seed Postgres: `npm run db:seed`
3. Start API in postgres mode: `npm run dev:api:postgres`
4. Start web: `npm run dev:web`

In the UI, route headers show a data source badge:

- **DB-backed API** when remote query succeeds
- **Fallback dataset** when API is unavailable (network-safe local fallback)

Posting behavior in DB mode:

- `Publish request` calls `GET /aid/post/create`
- On success, the created post is inserted into Postgres and becomes immediately queryable via `/query/feed` and `/query/map`

Additional seed scripts (API workspace):

- Append mode: `npm run db:seed:append -w @patchwork/api`
- Phase 3 fixtures only: `npm run db:seed:phase3 -w @patchwork/api`

Stop Postgres when done: `npm run db:down`

## Common commands

- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit tests: `npm run test`
- Moderation/privacy regression suite: `npm run test:phase7`
- End-to-end contract flow: `npm run test:phase8-e2e`
- Browser E2E (web): `npm run test:e2e -w @patchwork/web`
- Build all workspaces: `npm run build`
- Combined local gate: `npm run check`

## Docker deployment (shared `web` network)

The production compose stack is defined in `docker-compose.yml`.

- Caddy route host: `https://patchwork.subcult.tv`
- Shared Docker network: `web` (external)
- Internal service network: `internal`

Services:

- `patchwork-web` (nginx serving built Vite app)
- `patchwork-api`
- `patchwork-spool` (also aliased as `patchwork-quilt`)
- `patchwork-thimble`
- `patchwork-postgres`

Monitoring:

- Prometheus scrapes `/metrics` from API, Spool, and Thimble jobs via the shared network.

## Architecture and protocol docs

- `docs/architecture/domain-map.md`
- `docs/architecture/service-boundaries.md`
- `docs/architecture/adr/0001-v1-stack-and-domain-boundaries.md`
- `docs/at-protocol/README.md`
- `docs/at-protocol/identity-session.md`
- `docs/at-protocol/lexicon-versioning.md`
- `docs/at-protocol/tombstone-contract.md`
- `docs/quality-gates.md`

## Notes for contributors

- Keep cross-service contracts in `packages/shared`.
- Prefer deterministic fixtures in tests.
- Treat geoprivacy/moderation regressions as release blockers.
