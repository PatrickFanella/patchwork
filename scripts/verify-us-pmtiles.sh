#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PMTILES_BIN="${PMTILES_BIN:-$(command -v pmtiles 2>/dev/null || true)}"

fail() { printf '%s\n' "$*" >&2; exit 1; }

require_tool() { command -v "$1" >/dev/null 2>&1 || fail "missing required tool: $1"; }

validate_filename() {
  [[ "$1" =~ ^us\.[0-9a-f]{64}\.pmtiles$ ]] || fail "invalid pmtiles filename: $1"
}

read_sidecar_hash() {
  local sidecar=$1 expected_name=$2
  [[ -f "$sidecar" ]] || fail "missing sidecar: $sidecar"
  read -r hash name < "$sidecar"
  [[ "$name" == "$expected_name" ]] || fail "sidecar filename mismatch: $name"
  [[ "$hash" =~ ^[0-9a-f]{64}$ ]] || fail "invalid sidecar hash: $hash"
  printf '%s' "$hash"
}

main() {
  local directory=${1:-}
  local filename=${2:-}
  [[ -n "$directory" && -n "$filename" ]] || fail 'usage: verify-us-pmtiles.sh <directory> <filename>'
  require_tool sha256sum
  require_tool python3
  [[ -n "$PMTILES_BIN" && -x "$PMTILES_BIN" ]] || fail 'PMTILES_BIN must point to an executable pmtiles CLI'
  validate_filename "$filename"
  local artifact="$directory/$filename"
  local sidecar="$artifact.sha256"
  [[ -f "$artifact" ]] || fail "missing artifact: $artifact"
  local sidecar_hash actual_hash
  sidecar_hash=$(read_sidecar_hash "$sidecar" "$filename")
  actual_hash=$(sha256sum "$artifact" | awk '{print $1}')
  [[ "$actual_hash" == "$sidecar_hash" ]] || fail "hash mismatch for $filename"
  [[ "$filename" == "us.$actual_hash.pmtiles" ]] || fail "filename hash mismatch for $filename"
  local header_json
  header_json=$($PMTILES_BIN show "$artifact" --header-json)
  python3 -c 'import json, sys; data = json.loads(sys.argv[1]);
if data.get("maxzoom") != 10:
    raise SystemExit(f"unexpected pmtiles maxzoom: {data.get('"'"'maxzoom'"'"')!r}")' "$header_json"
  printf '{"filename":"%s","sha256":"%s","verified":true}\n' "$filename" "$actual_hash"
}

main "$@"
