#!/usr/bin/env bash
set -euo pipefail

readonly PMTILES_SOURCE_URL="${PMTILES_SOURCE_URL:-https://build.protomaps.com/20260720.pmtiles}"
readonly PMTILES_SOURCE_CONTENT_LENGTH="${PMTILES_SOURCE_CONTENT_LENGTH:-136853246056}"
readonly PMTILES_CLI_URL="${PMTILES_CLI_URL:-https://github.com/protomaps/go-pmtiles/releases/download/v1.31.1/go-pmtiles_1.31.1_Linux_x86_64.tar.gz}"
readonly PMTILES_CLI_SHA256="${PMTILES_CLI_SHA256:-71b2212d6796e172b8ba27c21e662c25ec93cacdb88adc35e508617e720f6292}"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
readonly PMTILES_REGION_GEOJSON="${PMTILES_REGION_GEOJSON:-$REPO_ROOT/deploy/maps/us-region.geojson}"
readonly PMTILES_DESTINATION="${PMTILES_DESTINATION:-/srv/data/patchwork-map/us.pmtiles}"
readonly PMTILES_DRY_RUN="${PMTILES_DRY_RUN:-0}"

readonly CURL_BIN="${CURL_BIN:-curl}"
readonly SHA256SUM_BIN="${SHA256SUM_BIN:-sha256sum}"
readonly TAR_BIN="${TAR_BIN:-tar}"
readonly MKTEMP_BIN="${MKTEMP_BIN:-mktemp}"
readonly MV_BIN="${MV_BIN:-mv}"
readonly RM_BIN="${RM_BIN:-rm}"
readonly PYTHON_BIN="${PYTHON_BIN:-python3}"

fail() { printf '%s\n' "$*" >&2; exit 1; }

require_file() { [[ -f "$1" ]] || fail "missing required file: $1"; }

require_tool() { command -v "$1" >/dev/null 2>&1 || fail "missing required tool: $1"; }

validate_region_geojson() {
  "$PYTHON_BIN" - "$PMTILES_REGION_GEOJSON" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as fh:
    data = json.load(fh)
if data.get('type') not in {'Polygon', 'MultiPolygon'}:
    raise SystemExit(f'region file must be top-level Polygon or MultiPolygon, got {data.get("type")!r}')
if 'coordinates' not in data:
    raise SystemExit('region file missing coordinates')
PY
}

validate_pmtiles_metadata() {
  local metadata_file=$1
  "$PYTHON_BIN" - "$metadata_file" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as fh:
    data = json.load(fh)
maxzoom = data.get('maxzoom') if isinstance(data, dict) else None
if maxzoom != 10:
    raise SystemExit(f'unexpected pmtiles maxzoom: {maxzoom!r}')
PY
}

verify_content_length() {
  local headers=$1
  local content_length
  content_length=$(printf '%s\n' "$headers" | tr -d '\r' | awk -F': ' 'BEGIN{IGNORECASE=1} /^Content-Length:/ {print $2; exit}')
  [[ -n "$content_length" ]] || fail "missing Content-Length for $PMTILES_SOURCE_URL"
  [[ "$content_length" == "$PMTILES_SOURCE_CONTENT_LENGTH" ]] || fail "unexpected Content-Length for $PMTILES_SOURCE_URL: $content_length"
}

download_cli() {
  local tmpdir=$1 cli_archive=$2
  "$CURL_BIN" -fsSL "$PMTILES_CLI_URL" -o "$cli_archive"
  printf '%s  %s\n' "$PMTILES_CLI_SHA256" "$cli_archive" | "$SHA256SUM_BIN" -c - >/dev/null
  "$TAR_BIN" -xzf "$cli_archive" -C "$tmpdir"
}

main() {
  local destination="${1:-$PMTILES_DESTINATION}"
  require_tool "$CURL_BIN"
  require_tool "$SHA256SUM_BIN"
  require_tool "$TAR_BIN"
  require_tool "$MKTEMP_BIN"
  require_tool "$MV_BIN"
  require_tool "$RM_BIN"
  require_tool "$PYTHON_BIN"
  require_file "$PMTILES_REGION_GEOJSON"
  validate_region_geojson
  local destination_dir
  destination_dir=$(dirname "$destination")
  local artifact_tmp checksum_tmp cli_archive headers pmtiles_bin tmp_destination tmp_checksum
  tmpdir=
  tmpdir=$($MKTEMP_BIN -d)
  cleanup() { "$RM_BIN" -rf "$tmpdir"; }
  trap cleanup EXIT
  cli_archive="$tmpdir/pmtiles.tar.gz"
  artifact_tmp="$tmpdir/us.pmtiles.tmp"
  tmp_destination="$tmpdir/$(basename -- "$destination")"
  tmp_checksum="$tmp_destination.sha256"

  headers=$("$CURL_BIN" -fsSI "$PMTILES_SOURCE_URL")
  verify_content_length "$headers"

  download_cli "$tmpdir" "$cli_archive"
  pmtiles_bin="$tmpdir/pmtiles"
  [[ -x "$pmtiles_bin" ]]

  if [[ "$PMTILES_DRY_RUN" == 1 ]]; then
    "$pmtiles_bin" extract "$PMTILES_SOURCE_URL" "$artifact_tmp" --region="$PMTILES_REGION_GEOJSON" --maxzoom 10 --dry-run
    exit 0
  fi

  "$pmtiles_bin" extract "$PMTILES_SOURCE_URL" "$artifact_tmp" --region="$PMTILES_REGION_GEOJSON" --maxzoom 10
  local metadata_tmp="$tmpdir/us.pmtiles.metadata.json"
  "$pmtiles_bin" show "$artifact_tmp" --header-json > "$metadata_tmp"
  validate_pmtiles_metadata "$metadata_tmp"
  "$SHA256SUM_BIN" "$artifact_tmp" | awk -v name="$(basename -- "$destination")" '{print $1 "  " name}' > "$tmp_checksum"
  mkdir -p "$destination_dir"
  "$MV_BIN" -f "$artifact_tmp" "$tmp_destination"
  "$MV_BIN" -f "$tmp_destination" "$destination"
  "$MV_BIN" -f "$tmp_checksum" "$destination.sha256"
}

main "$@"
