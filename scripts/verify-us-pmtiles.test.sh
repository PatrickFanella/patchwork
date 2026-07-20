#!/usr/bin/env bash
set -euo pipefail

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

mkdir -p "$tmpdir/out"
hash=$(python3 - <<'PY'
import hashlib
print(hashlib.sha256(b'content').hexdigest())
PY
)
filename="us.${hash}.pmtiles"
printf 'content' > "$tmpdir/out/$filename"
python3 - "$tmpdir/out/$filename" "$tmpdir/out/$filename.sha256" <<'PY'
import hashlib, sys
path, out = sys.argv[1:3]
digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()
with open(out, 'w', encoding='utf-8') as fh:
    fh.write(f'{digest}  {path.rsplit("/", 1)[-1]}\n')
PY

cat > "$tmpdir/bin-pmtiles" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == 'show' && "$3" == '--header-json' ]]; then
  printf '{"maxzoom":10}\n'
else
  exit 1
fi
EOF
chmod +x "$tmpdir/bin-pmtiles"
export PMTILES_BIN="$tmpdir/bin-pmtiles"

bash scripts/verify-us-pmtiles.sh "$tmpdir/out" "$filename" >/dev/null

if bash scripts/verify-us-pmtiles.sh "$tmpdir/out" 'us.bad.pmtiles' 2>"$tmpdir/err"; then
  exit 1
fi
grep -q 'invalid pmtiles filename' "$tmpdir/err"
