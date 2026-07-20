#!/usr/bin/env bash
set -euo pipefail

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
repo_root=$(pwd)

mkdir -p "$tmpdir/bin" "$tmpdir/work/deploy/maps" "$tmpdir/work/out"
cp "$repo_root/deploy/maps/us-region.geojson" "$tmpdir/work/deploy/maps/us-region.geojson"
printf 'preserve' > "$tmpdir/work/out/keep.txt"

content_hash=$(python3 - <<'PY'
import hashlib
print(hashlib.sha256(b'content').hexdigest())
PY
)

cat > "$tmpdir/bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *'-fsSI https://build.protomaps.com/20260720.pmtiles'*) printf 'HTTP/2 200\r\nContent-Length: 136853246056\r\n\r\n' ;;
  *'-fsSL https://github.com/protomaps/go-pmtiles/releases/download/v1.31.1/go-pmtiles_1.31.1_Linux_x86_64.tar.gz -o '*)
    outfile=${*: -1}
    : > "$outfile"
    ;;
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
if [[ "$1" == *us.pmtiles.tmp ]]; then
  printf '%s  %s\n' "$CONTENT_HASH" "$1"
else
  python3 - "$1" <<'PY'
import hashlib, sys
path = sys.argv[1]
print(f"{hashlib.sha256(open(path,'rb').read()).hexdigest()}  {path}")
PY
fi
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
export CONTENT_HASH="$content_hash"
export PMTILES_DESTINATION_DIR="$tmpdir/work/out"
export PMTILES_REGION_GEOJSON="$tmpdir/work/deploy/maps/us-region.geojson"

bash "$repo_root/scripts/fetch-us-pmtiles.sh" >/dev/null
[[ -f "$tmpdir/work/out/us.${content_hash}.pmtiles" ]]
[[ -f "$tmpdir/work/out/us.${content_hash}.pmtiles.sha256" ]]
[[ "$(cat "$tmpdir/work/out/us.${content_hash}.pmtiles.sha256")" == "${content_hash}  us.${content_hash}.pmtiles" ]]
[[ "$(cat "$tmpdir/work/out/keep.txt")" == 'preserve' ]]

export PMTILES_DRY_RUN=1
bash "$repo_root/scripts/fetch-us-pmtiles.sh" "$tmpdir/work/out/dry-run" >/dev/null
[[ ! -e "$tmpdir/work/out/dry-run/us.dry-run.pmtiles" ]]
unset PMTILES_DRY_RUN

cat > "$tmpdir/bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'HTTP/2 200\r\nContent-Length: 1\r\n\r\n'
EOF
chmod +x "$tmpdir/bin/curl"

if bash "$repo_root/scripts/fetch-us-pmtiles.sh" "$tmpdir/work/out/bad" 2> "$tmpdir/err"; then
  exit 1
fi
grep -q 'unexpected Content-Length' "$tmpdir/err"
