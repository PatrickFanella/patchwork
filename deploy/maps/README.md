# Map tile coverage and rollback

This deployment serves a US-centered pilot PMTiles extract, not an exact political clip of every boundary.

Coverage note:
- Main contiguous US coverage
- Alaska / Hawaii context
- Puerto Rico, USVI, Guam, Northern Mariana Islands, American Samoa context boxes

Source/verification:
- Base geometry: `us-region.geojson`
- Generated artifacts are content-addressed as `us.<sha256>.pmtiles` with matching `.sha256`

Rollback guidance:
- Never delete prior PMTiles artifacts; keep earlier versions in the tile directory.
- Rolling back the web image restores the embedded `VITE_MAP_TILE_URL`, so image rollback also restores tile selection.
- To verify a candidate artifact: run `scripts/verify-us-pmtiles.sh <directory> <filename>`.
