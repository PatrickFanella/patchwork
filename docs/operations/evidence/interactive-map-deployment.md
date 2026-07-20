# Interactive Map Deployment Evidence

**Date:** 2026-07-20  
**Runtime revision:** `796795b57e13ccf9a4955851c9239cb00f426db0`  
**Review verdicts:** Oracle `DEPLOY`; Designer `PASS`

## Root cause and delivered behavior

The prior `/map` route did not contain a geographic renderer; it displayed cluster and request lists only. The deployed implementation lazy-loads Leaflet and protomaps-leaflet inside the existing frontend shell and always renders a same-origin basemap, including when the live discovery API returns zero records.

The existing filters, API status, semantic request list, actions, chat, and detail drawer remain available. Tile failures are reported separately from discovery failures.

## Privacy and accessibility controls

- API `approximateGeo.precisionKm` is preserved through the web model.
- Public map geometry is clamped to `PUBLIC_MIN_PRECISION_KM` (`1km`).
- The map renders snapped approximate circles and aggregate clusters, never exact pins.
- Fabricated NYC coordinates and the old 300m fallback were removed.
- A multi-item cluster suppresses duplicate individual circles.
- The map is a labeled region with keyboard instructions; Escape clears selection.
- The semantic list/detail interface remains the accessible fallback.
- No real aid request was created for deployment validation. Marker and selection behavior use automated test fixtures.

## Basemap artifact

- Source build: `https://build.protomaps.com/20260720.pmtiles`
- Pinned source Content-Length: `136853246056`
- PMTiles CLI: `v1.31.1` Linux x86_64
- CLI SHA-256: `71b2212d6796e172b8ba27c21e662c25ec93cacdb88adc35e508617e720f6292`
- Host path: `/srv/data/patchwork-map/us.9a7697125792ba1aa267fca4fa8751172ddd9347e00e9462beb727edf9bbde82.pmtiles`
- Artifact SHA-256: `9a7697125792ba1aa267fca4fa8751172ddd9347e00e9462beb727edf9bbde82`
- Size: approximately 433 MB decimal (412.6 MiB)
- Format: MVT, gzip
- Zoom range: 0–10
- Header bounds: `[-179.148909,18.9101,-66.885444,71.5388]`

The deployed artifact was generated before Puerto Rico and other territory context boxes were added to `deploy/maps/us-region.geojson`. It covers the CONUS/Alaska/Hawaii pilot context. Future regeneration can include the additional documented territory context; this deployment does not claim that expanded coverage.

The archive is content-addressed. Nginx serves only `/tiles/us.<64 lowercase hex>.pmtiles` with immutable caching and byte ranges. `/tiles/us.pmtiles` returns 404. Prior archives are retained so rolling back the web image also restores its embedded archive URL.

## Verification

The full `npm run check` passed after implementation, including map component/model/API tests, all workspace suites, and strict Bash tile tests. Observed suite totals included 224 web tests, 257 API tests with 37 intentional integration skips, 34 indexer tests with 14 skips, 52 moderation tests with 11 skips, 18 AT-client tests, 3 lexicon tests, and 285 shared tests.

Artifact verification passed with an explicit PMTiles CLI:

```bash
PMTILES_BIN=/tmp/opencode/pmtiles scripts/verify-us-pmtiles.sh \
  /srv/data/patchwork-map/us.9a7697125792ba1aa267fca4fa8751172ddd9347e00e9462beb727edf9bbde82.pmtiles
```

Post-deployment checks:

```text
GET https://patchwork.subcult.tv/map                                      200
GET https://patchwork.subcult.tv/api/health/ready                         200
Range: bytes=0-1023 on the content-addressed PMTiles URL                   206, 1024 bytes
GET https://patchwork.subcult.tv/tiles/us.pmtiles                          404
container health                                                           healthy
container OCI revision                                                     796795b57e13ccf9a4955851c9239cb00f426db0
```

Container logs after the final rebuild show recurring health probes reading `/`, not the PMTiles archive.

## Rollback

The previous web image is tagged `patchwork-patchwork-web:pre-map-20260720`. Restore that image if required. Keep its referenced PMTiles archive available; do not replace content at an existing hash-named URL.

## Remaining concern

The staging workflow's build-time `STAGING_VITE_MAP_TILE_URL` and the remote staging Compose environment can drift. Production used one host environment for both build and runtime checks. A future Phase 7 improvement should generate both values from one deployment manifest and verify the exact URL embedded in the web bundle before readiness succeeds.
