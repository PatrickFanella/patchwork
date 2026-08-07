#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
mkdir -p "$tmpdir/bin"

cat > "$tmpdir/bin/cosign" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$COSIGN_CALLS"
[[ "$*" != *'reject-this'* ]]
EOF
chmod +x "$tmpdir/bin/cosign"

sha=0123456789abcdef0123456789abcdef01234567
digest=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
cat > "$tmpdir/manifest.json" <<EOF
{"gitSha":"$sha","images":{"api":"registry.test/patchwork-api@sha256:$digest","indexer":"registry.test/patchwork-indexer@sha256:$digest","moderation":"registry.test/patchwork-moderation@sha256:$digest","web":"registry.test/patchwork-web@sha256:$digest"}}
EOF

export PATH="$tmpdir/bin:$PATH"
export COSIGN_CALLS="$tmpdir/calls"
export PATCHWORK_RELEASE_VERIFY_MODE=keyless
export PATCHWORK_ALLOWED_IMAGE_PREFIX=registry.test/patchwork-
export PATCHWORK_COSIGN_CERTIFICATE_IDENTITY_REGEXP='https://example.test/workflow@.*'
bash "$repo_root/scripts/verify-release-trust.sh" "$tmpdir/manifest.json" >/dev/null
[[ "$(wc -l < "$tmpdir/calls")" -eq 12 ]]
grep -q 'verify-attestation.*--type spdxjson' "$tmpdir/calls"
grep -q 'verify-attestation.*--type slsaprovenance' "$tmpdir/calls"

if PATCHWORK_ALLOWED_IMAGE_PREFIX=wrong.example/ \
    bash "$repo_root/scripts/verify-release-trust.sh" "$tmpdir/manifest.json" >/dev/null 2>&1; then
    exit 1
fi

touch "$tmpdir/public.pem"
PATCHWORK_RELEASE_VERIFY_MODE=key \
PATCHWORK_COSIGN_PUBLIC_KEY="$tmpdir/public.pem" \
bash "$repo_root/scripts/verify-release-trust.sh" "$tmpdir/manifest.json" >/dev/null
grep -q -- '--key .*public.pem' "$tmpdir/calls"

if PATCHWORK_RELEASE_VERIFY_MODE=invalid \
    bash "$repo_root/scripts/verify-release-trust.sh" "$tmpdir/manifest.json" >/dev/null 2>&1; then
    exit 1
fi
