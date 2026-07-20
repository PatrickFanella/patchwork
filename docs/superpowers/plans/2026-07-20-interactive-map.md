# Interactive Map Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Keep steps small, commit in logical slices, and do not skip the verification checklist.

**Goal:** Replace the current map placeholder behavior with a real interactive map for US-only approximate discovery while preserving the existing semantic list/detail fallback and the privacy boundary.

**Architecture:** Use Leaflet + protomaps-leaflet on a lazy-loaded `/map` route. The map consumes approximate location data only, never exact pins; it must render circles and clusters at a minimum 1km precision floor, bind selection with the list and drawer, and distinguish no records, no location, API failure, and tile failure states. A same-origin `/tiles/us.pmtiles` artifact is served by Nginx with Range support and immutable caching.

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
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/main.tsx`
- Create: `apps/web/src/map-route.tsx`

- [ ] Add a dedicated `/map` route that lazy-loads the map code and leaves other routes untouched.
- [ ] Keep the semantic list/detail view as the fallback when map data is missing or unavailable.
- [ ] Ensure route loading does not pull the map bundle onto non-map pages.
- [ ] Replace the fabricated fallback location in `toMapAidCard` with a strict optional location pass-through.

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

- [ ] Raise map marker precision to `>= 1km` using the shared privacy constant.
- [ ] Never emit exact pins; convert approximate locations into circles/clusters only.
- [ ] Remove the synthetic 300m fallback and any forced area label based on exact rounding.
- [ ] Preserve `approximateGeo.precisionKm` from the API all the way into UI models.
- [ ] Keep no-record, no-location, and malformed API results distinguishable.

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
- Create: `apps/web/src/components/map/MapLegend.tsx`
- Create: `apps/web/src/components/map/MapStatusBanner.tsx`
- Modify: `apps/web/src/features/frontend-shell.tsx`

- [ ] Render Leaflet with protomaps-leaflet using the same-origin PMTiles source.
- [ ] Draw circles for approximate markers and aggregate clusters when nearby markers overlap.
- [ ] Bind selection both ways between map markers, list rows, and the detail drawer.
- [ ] Show distinct banners for empty results, no location, API error, and tile load failure.
- [ ] Add OSM attribution in the map control/footer area.

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

- [ ] Add a precision-floor test that proves `precisionKm < 1` becomes `>= 1km`.
- [ ] Add API mapping tests for `approximateGeo.precisionKm`, missing location, malformed payload, and tile/API failure separation.
- [ ] Add component tests for circle rendering, cluster rendering, selection binding, and fallback states.
- [ ] Add a test proving no fabricated fallback location is used.

**Verification commands:**

- `npm run test -w @patchwork/web -- map-ux.test.ts`
- `npm run test -w @patchwork/web -- InteractiveMap.test.tsx`
- `npm run test -w @patchwork/web -- api-client.test.ts`

**Expected outcome:**

- Test suite captures both privacy and UX behavior.

## Task 5 — Serve `/tiles/us.pmtiles` from Nginx

**Files:**

- Modify: `docker/nginx/patchwork-web.conf`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.staging.yml`

- [ ] Add a location block for `/tiles/us.pmtiles`.
- [ ] Preserve HTTP Range support and immutable caching headers.
- [ ] Keep the tile artifact same-origin to avoid cross-origin leakage.
- [ ] Mount the artifact as a required host file in Compose.

**Representative Nginx snippet:**

```nginx
location /tiles/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
}
```

**Verification commands:**

- `curl -I http://localhost/tiles/us.pmtiles`
- `curl -r 0-1023 -I http://localhost/tiles/us.pmtiles`

**Expected outcome:**

- A byte-range request returns `206 Partial Content`.

## Task 6 — Add the strict PMTiles fetch/extract script

**Files:**

- Create: `scripts/fetch-us-pmtiles.sh`
- Create: `scripts/fetch-us-pmtiles.test.sh`
- Create: `deploy/maps/us-region.geojson`

- [ ] Download the pinned PMTiles CLI release for Linux x86_64.
- [ ] Verify the CLI SHA-256 before use.
- [ ] Verify the pinned source build's HTTP Content-Length before extraction.
- [ ] Extract US coverage directly from the remote archive with HTTP Range requests, `deploy/maps/us-region.geojson`, and `--maxzoom=10`; do not download the 136 GB planet archive.
- [ ] Validate the extracted temporary artifact, checksum it, and atomically replace the destination file.
- [ ] Fail closed on checksum mismatch, truncated download, or partial extraction.

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
- Modify: `docs/operations/rollback-policy.md`

- [ ] Require the PMTiles artifact before the web service can start.
- [ ] Document rollout and rollback for the tile artifact alongside the app images.
- [ ] Keep rollout atomic: replace the file only after validation succeeds.

**Verification commands:**

- `docker compose -f docker-compose.staging.yml config`
- `npm run build -w @patchwork/web`

**Expected outcome:**

- Deployment fails early if the tile artifact is missing or invalid.

## Task 8 — Final runtime and accessibility validation

**Files:**

- Modify: `docs/operations/evidence/`

- [ ] Verify `/map` with real data and the US PMTiles artifact.
- [ ] Confirm keyboard navigation, focus order, and drawer selection work.
- [ ] Confirm the fallback list/detail experience still works when the map cannot load.
- [ ] Record the exact commands and the resulting artifact hashes in evidence.

**Verification commands:**

- `npm run check`
- `npm run build`
- `npm run test:e2e -w @patchwork/web`

**Expected outcome:**

- The map is shippable without weakening privacy or the existing fallback UX.

## Rollout / rollback

- Roll out behind the `/map` route only.
- If the tile artifact or map bundle fails, keep the list/detail fallback and disable the route entrypoint.
- Roll back by restoring the previous web image and previous tile artifact checksum.

## Non-goals

- No exact geocoding.
- No non-US coverage.
- No map-based account creation.
- No new public AT write flow.
