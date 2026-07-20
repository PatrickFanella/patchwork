# Interactive Map Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Keep steps small, commit in logical slices, and do not skip the verification checklist.

**Goal:** Replace the current map placeholder behavior with a real interactive map for US-only approximate discovery while preserving the existing semantic list/detail fallback and the privacy boundary.

**Architecture:** Use Leaflet + protomaps-leaflet in a lazy-loaded map chunk inside the existing `/map` shell. The map consumes approximate location data only, never exact pins; it renders circles and clusters at a minimum 1km precision floor, binds selection with the list and drawer, and distinguishes no records, no location, API failure, and tile failure states. Nginx serves a same-origin, content-addressed `/tiles/us.<sha256>.pmtiles` artifact with Range support and immutable caching; the mutable `/tiles/us.pmtiles` path is intentionally unavailable.

**Execution status (2026-07-20):** Complete and deployed. Runtime revision `796795b57e13ccf9a4955851c9239cb00f426db0` is healthy. The deployed archive is `us.9a7697125792ba1aa267fca4fa8751172ddd9347e00e9462beb727edf9bbde82.pmtiles`, capped at zoom 10. The current artifact was generated before the later territory context boxes were added to the source region and therefore covers the CONUS/Alaska/Hawaii pilot context; regenerate it before claiming the additional territory context documented for future archives.

**Fixed decisions:**

- US coverage only.
- Existing semantic list/detail fallback stays intact.
- Server `approximateGeo.precisionKm` is preserved end-to-end.
- `>= 1km` public precision floor.
- Never render exact pins.
- Remove fabricated fallback location and 300m precision.
- No real aid-request creation unless explicitly approved.

**Recommended initial tile cap:** maxzoom `10`.

Why: it keeps the first US basemap small enough for staged delivery and low-risk caching while still supporting useful neighborhood-scale context for approximate circles/clusters. Higher zooms would increase the artifact size and operational burden without improving the privacy contract, because the UI must never disclose exact locations.

---

## Task 1 — Add the map route skeleton and lazy-load boundary

**Files:**

- Modify: `apps/web/src/features/frontend-shell.tsx`
- Create: `apps/web/src/components/map/InteractiveMap.tsx`

- [x] Add a lazy-loaded map chunk inside the existing `/map` shell and leave other routes untouched.
- [x] Keep the semantic list/detail view as the fallback when map data is missing or unavailable.
- [x] Ensure route loading does not pull the map bundle onto non-map pages.
- [x] Replace the fabricated fallback location in `toMapAidCard` with a strict optional location pass-through.

**Verification commands:**

- `npm run test -w @patchwork/web -- map-ux.test.ts`
- `npm run build -w @patchwork/web`

**Expected outcome:**

- `/map` loads its own chunk.
- Non-map routes continue rendering exactly as before.

## Task 2 — Tighten map model privacy rules

**Files:**

- Modify: `apps/web/src/map-ux.ts`
- Modify: `apps/web/src/features/api-client.ts`
- Modify: `apps/web/src/feed-ux.ts`
- Modify: `packages/shared/src/privacy.ts`

- [x] Raise map marker precision to `>= 1km` using the shared privacy constant.
- [x] Never emit exact pins; convert approximate locations into circles/clusters only.
- [x] Remove the synthetic 300m fallback and any forced area label based on exact rounding.
- [x] Preserve `approximateGeo.precisionKm` from the API all the way into UI models.
- [x] Keep no-record, no-location, and malformed API results distinguishable.

**Representative interface target:**

```ts
export interface MapAidLocation {
    lat: number;
    lng: number;
    precisionMeters: number;
    areaLabel?: string;
}
```

**Verification commands:**

- `npm run test -w @patchwork/web -- map-ux.test.ts`
- `npm run test -w @patchwork/web -- api-client.test.ts`

**Expected outcome:**

- Approximate markers clamp to at least 1000 meters.
- Records without usable location data remain visible in list/detail fallback, not as fake pins.

## Task 3 — Build the Leaflet map surface

**Files:**

- Create: `apps/web/src/components/map/InteractiveMap.tsx`
- Modify: `apps/web/src/features/frontend-shell.tsx`
- Modify: `apps/web/src/styles/index.css`

- [x] Render Leaflet with protomaps-leaflet using the same-origin PMTiles source.
- [x] Draw circles for approximate markers and aggregate clusters when nearby markers overlap.
- [x] Bind selection both ways between map markers, list rows, and the detail drawer.
- [x] Show distinct banners for empty results, no location, API error, and tile load failure.
- [x] Add OSM attribution in the map control/footer area.

**Representative behavior contract:**

```ts
type MapState =
    | { kind: 'ready' }
    | { kind: 'empty-records' }
    | { kind: 'no-location' }
    | { kind: 'api-failed'; message: string }
    | { kind: 'tiles-failed'; message: string };
```

**Verification commands:**

- `npm run test -w @patchwork/web -- map-ux.test.ts`
- `npm run test -w @patchwork/web -- frontend-shell.test.tsx`

**Expected outcome:**

- The map never displays exact pins.
- Clicking a circle or list row opens the same detail drawer.

## Task 4 — Add map-focused tests

**Files:**

- Modify: `apps/web/src/map-ux.test.ts`
- Modify: `apps/web/src/features/api-client.test.ts`
- Create: `apps/web/src/components/map/InteractiveMap.test.tsx`

- [x] Add a precision-floor test that proves `precisionKm < 1` becomes `>= 1km`.
- [x] Add API mapping tests for `approximateGeo.precisionKm`, missing location, malformed payload, and tile/API failure separation.
- [x] Add component tests for circle rendering, cluster rendering, selection binding, and fallback states.
- [x] Add a test proving no fabricated fallback location is used.

**Verification commands:**

- `npm run test -w @patchwork/web -- map-ux.test.ts`
- `npm run test -w @patchwork/web -- InteractiveMap.test.tsx`
- `npm run test -w @patchwork/web -- api-client.test.ts`

**Expected outcome:**

- Test suite captures both privacy and UX behavior.

## Task 5 — Serve content-addressed PMTiles from Nginx

**Files:**

- Modify: `docker/nginx/patchwork-web.conf`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.staging.yml`

- [x] Add a strict location block for `/tiles/us.<sha256>.pmtiles` and return 404 for `/tiles/us.pmtiles`.
- [x] Preserve HTTP Range support and immutable caching headers.
- [x] Keep the tile artifact same-origin to avoid cross-origin leakage.
- [x] Mount the artifact directory read-only and require its content-addressed filename in Compose.

**Representative Nginx snippet:**

```nginx
location ~ ^/tiles/us\.[0-9a-f]{64}\.pmtiles$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
}
```

**Verification commands:**

- `curl -I http://localhost/tiles/us.<sha256>.pmtiles`
- `curl -r 0-1023 -I http://localhost/tiles/us.<sha256>.pmtiles`
- `curl -I http://localhost/tiles/us.pmtiles` (expected 404)

**Expected outcome:**

- A byte-range request returns `206 Partial Content`.

## Task 6 — Add the strict PMTiles fetch/extract script

**Files:**

- Create: `scripts/fetch-us-pmtiles.sh`
- Create: `scripts/fetch-us-pmtiles.test.sh`
- Create: `deploy/maps/us-region.geojson`

- [x] Download the pinned PMTiles CLI release for Linux x86_64.
- [x] Verify the CLI SHA-256 before use.
- [x] Verify the pinned source build's HTTP Content-Length before extraction.
- [x] Extract US-centered coverage directly from the remote archive with HTTP Range requests, `deploy/maps/us-region.geojson`, and `--maxzoom=10`; do not download the 136 GB planet archive.
- [x] Validate the extracted temporary artifact, checksum it, and publish it under its content-addressed filename without deleting prior versions.
- [x] Fail closed on checksum mismatch, missing PMTiles CLI, wrong maxzoom, truncated download, or partial extraction.

**Pinned first artifact:**

- Build URL: `https://build.protomaps.com/20260720.pmtiles`
- Content-Length: `136853246056`
- PMTiles CLI version: `v1.31.1` Linux x86_64
- CLI SHA-256: `71b2212d6796e172b8ba27c21e662c25ec93cacdb88adc35e508617e720f6292`

**Representative shell contract:**

```bash
set -euo pipefail
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
```

**Verification commands:**

- `bash scripts/fetch-us-pmtiles.sh`
- `bash scripts/fetch-us-pmtiles.test.sh`

**Expected outcome:**

- The script never leaves a partial tile file in place.
- The script never stores the full planet archive locally.

## Task 7 — Wire deployment and rollback behavior

**Files:**

- Modify: `docker-compose.staging.yml`
- Modify: `deploy/maps/README.md`

- [x] Require the PMTiles artifact before the web service can start without reading the archive during recurring health probes.
- [x] Document rollout and rollback for the tile artifact alongside the app images.
- [x] Keep rollout immutable: publish a new hash-named file only after validation succeeds and retain prior versions for rollback.

**Verification commands:**

- `docker compose -f docker-compose.staging.yml config`
- `npm run build -w @patchwork/web`

**Expected outcome:**

- Deployment fails early if the tile artifact is missing or invalid.

## Task 8 — Final runtime and accessibility validation

**Files:**

- Create: `docs/operations/evidence/interactive-map-deployment.md`

- [x] Verify `/map` against the live empty-result API and the deployed US PMTiles artifact; marker behavior is covered with automated fixtures because no real aid request was created.
- [x] Confirm keyboard navigation, focus behavior, Escape deselection, and shared drawer selection in component tests and UI review.
- [x] Confirm the fallback list/detail experience remains available when the map cannot load.
- [x] Record the exact commands and resulting artifact hashes in deployment evidence.

**Verification commands:**

- `npm run check`
- `npm run build`
- `npm run test:e2e -w @patchwork/web`

**Expected outcome:**

- The map is shippable without weakening privacy or the existing fallback UX.

## Rollout / rollback

- Roll out behind the `/map` route only.
- If the tile artifact or map bundle fails, keep the list/detail fallback and disable the route entrypoint.
- Roll back by restoring the previous web image; its embedded content-addressed URL selects the retained prior tile artifact.

## Non-goals

- No exact geocoding.
- No non-US coverage.
- No map-based account creation.
- No new public AT write flow.
