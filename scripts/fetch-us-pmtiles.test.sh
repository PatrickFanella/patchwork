#!/usr/bin/env bash
set -euo pipefail

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
repo_root=$(pwd)

mkdir -p "$tmpdir/bin" "$tmpdir/work/deploy/maps"
cp "$repo_root/deploy/maps/us-region.geojson" "$tmpdir/work/deploy/maps/us-region.geojson"
mkdir -p "$tmpdir/work/out"
printf 'sentinel' > "$tmpdir/work/out/us.pmtiles"
printf 'preserve' > "$tmpdir/work/out/us.pmtiles.sha256"

cat > "$tmpdir/bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *'-fsSI https://build.protomaps.com/20260720.pmtiles'*) printf 'HTTP/2 200\r\nContent-Length: 136853246056\r\n\r\n' ;;
  *'-fsSL https://github.com/protomaps/go-pmtiles/releases/download/v1.31.1/go-pmtiles_1.31.1_Linux_x86_64.tar.gz -o '*) : ;;
  *) printf 'unexpected curl invocation: %s\n' "$*" >&2; exit 1 ;;
esac
EOF
chmod +x "$tmpdir/bin/curl"

cat > "$tmpdir/bin/sha256sum" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "-c" ]]; then
  read -r expected file
  [[ "$expected" == "71b2212d6796e172b8ba27c21e662c25ec93cacdb88adc35e508617e720f6292" ]]
  [[ -f "${file%:}" ]]
  exit 0
fi
printf 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef  %s\n' "$1"
EOF
chmod +x "$tmpdir/bin/sha256sum"

cat > "$tmpdir/bin/tar" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
dest=''
for ((i=1; i<=$#; i++)); do
  if [[ "${!i}" == '-C' ]]; then
    j=$((i+1)); dest="${!j}"; break
  fi
done
cat > "$dest/pmtiles" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  extract)
    printf 'extract %s %s %s %s %s\n' "$2" "$3" "$4" "$5" "$6" > "${3}.log"
    : > "$3"
    ;;
  show)
    printf '{"maxzoom":10}\n' ;;
  *) exit 1 ;;
esac
EOS
chmod +x "$dest/pmtiles"
EOF
chmod +x "$tmpdir/bin/tar"

export PATH="$tmpdir/bin:$PATH"
export PMTILES_DESTINATION="$tmpdir/work/out/us.pmtiles"
export PMTILES_REGION_GEOJSON="$tmpdir/work/deploy/maps/us-region.geojson"

bash "$repo_root/scripts/fetch-us-pmtiles.sh"
[[ -f "$PMTILES_DESTINATION" ]]
[[ -f "$PMTILES_DESTINATION.sha256" ]]
[[ "$(cat "$PMTILES_DESTINATION")" == 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef  us.pmtiles' ]]
[[ "$(cat "$PMTILES_DESTINATION.sha256")" == 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef  us.pmtiles' ]]
[[ "$(cat "$tmpdir/work/out/us.pmtiles")" == 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef  us.pmtiles' ]]

cat > "$tmpdir/bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'HTTP/2 200\r\nContent-Length: 1\r\n\r\n'
EOF
chmod +x "$tmpdir/bin/curl"

export PMTILES_DRY_RUN=1
if ! bash "$repo_root/scripts/fetch-us-pmtiles.sh" "$tmpdir/work/out/dry-run.pmtiles" >/dev/null; then
  exit 1
fi
[[ ! -e "$tmpdir/work/out/dry-run.pmtiles" ]]
unset PMTILES_DRY_RUN

if bash "$repo_root/scripts/fetch-us-pmtiles.sh" "$tmpdir/work/out/bad.pmtiles" 2> "$tmpdir/err"; then
  exit 1
fi
grep -q 'unexpected Content-Length' "$tmpdir/err"
