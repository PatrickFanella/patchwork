#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
mkdir -p "$tmpdir/bin" "$tmpdir/state"

cat > "$tmpdir/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$1" == inspect ]]; then
    printf '%s\n' "$FAKE_REVISION"
    exit 0
fi
if [[ "$1" == compose ]]; then
    printf '%s\n' "$*" >> "$DOCKER_CALLS"
    if [[ " $* " == *' pull '* && -n "${FAKE_PULL_COUNTER:-}" ]]; then
        count=0
        [[ ! -r "$FAKE_PULL_COUNTER" ]] || read -r count < "$FAKE_PULL_COUNTER"
        count=$((count + 1))
        printf '%s\n' "$count" > "$FAKE_PULL_COUNTER"
        if [[ "$count" -le "${FAKE_PULL_FAILURES:-0}" ]]; then
            echo 'Registry connection reset by peer.' >&2
            exit 1
        fi
    fi
    if [[ "${FAKE_INFRASTRUCTURE_PULL_UNAVAILABLE:-false}" == true && "${!#}" == pull ]]; then
        echo 'Object-store image is unavailable; application images remain pullable.' >&2
        exit 1
    fi
    if [[ " $* " == *' config --format json '* ]]; then
        printf '{"services":{"patchwork-spool":{"environment":{"INDEXER_PROJECTION_MODE":"%s"}}}}\n' \
            "${FAKE_PROJECTION_MODE:-v2-shadow}"
    elif [[ " $* " == *'/tiles/us.pmtiles'* ]]; then
        exit 1
    elif [[ " $* " == *' ps -q '* ]]; then
        printf 'fake-container\n'
    elif [[ " $* " == *' wc -c '* ]]; then
        printf '1024\n'
    fi
    exit 0
fi
exit 2
EOF
chmod +x "$tmpdir/bin/docker"
printf '#!/bin/sh\nexit 0\n' > "$tmpdir/bin/sleep"
chmod +x "$tmpdir/bin/sleep"

cat > "$tmpdir/verify" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ -r "$1" ]]
EOF
chmod +x "$tmpdir/verify"
touch "$tmpdir/env" "$tmpdir/compose.yml"

old_sha=1111111111111111111111111111111111111111
new_sha=2222222222222222222222222222222222222222
digest=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
tile=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
manifest() {
    local sha=$1 path=$2
    cat > "$path" <<EOF
{"gitSha":"$sha","mapTileUrl":"/tiles/us.$tile.pmtiles","images":{"api":"registry.test/api@sha256:$digest","indexer":"registry.test/indexer@sha256:$digest","moderation":"registry.test/moderation@sha256:$digest","web":"registry.test/web@sha256:$digest"}}
EOF
}

manifest "$old_sha" "$tmpdir/state/current-artifact-digests.json"
sha256sum "$tmpdir/state/current-artifact-digests.json" \
    > "$tmpdir/state/current-artifact-digests.json.sha256"
manifest "$new_sha" "$tmpdir/new.json"

export PATH="$tmpdir/bin:$PATH"
export PATCHWORK_RELEASE_STATE_DIR="$tmpdir/state"
export PATCHWORK_RELEASE_VERIFY_SCRIPT="$tmpdir/verify"
export FAKE_REVISION="$new_sha"
export FAKE_PROJECTION_MODE=v2-shadow
export DOCKER_CALLS="$tmpdir/docker-calls"
export PATCHWORK_EXPECTED_WEB_API_BASE_URL=https://patchwork.test/api
bash "$repo_root/scripts/deploy-staging-digests.sh" \
    "$tmpdir/new.json" "$tmpdir/env" "$tmpdir/compose.yml" >/dev/null
grep -q 'pull .*patchwork-v2-shadow' "$DOCKER_CALLS"
grep -q 'up -d --no-build --wait .*patchwork-v2-shadow' "$DOCKER_CALLS"
grep -q 'exec -T patchwork-v2-shadow .*4101/health/ready' "$DOCKER_CALLS"

cmp -s "$tmpdir/new.json" "$tmpdir/state/current-artifact-digests.json"
grep -q "$old_sha" "$tmpdir/state/previous-artifact-digests.json"
(
    cd "$tmpdir/state"
    sha256sum -c current-artifact-digests.json.sha256
    sha256sum -c previous-artifact-digests.json.sha256
) >/dev/null

export FAKE_REVISION="$old_sha"
export FAKE_INFRASTRUCTURE_PULL_UNAVAILABLE=true
bash "$repo_root/scripts/rollback-staging-digests.sh" \
    "$tmpdir/env" "$tmpdir/compose.yml" >/dev/null
grep -q 'stop patchwork-v2-shadow' "$DOCKER_CALLS"
grep -q 'rm -f patchwork-v2-shadow' "$DOCKER_CALLS"
grep -q "$old_sha" "$tmpdir/state/current-artifact-digests.json"

if PATCHWORK_EXPECTED_WEB_API_BASE_URL=http://10.0.0.56:3023 \
    bash "$repo_root/scripts/rollback-staging-digests.sh" \
        "$tmpdir/env" "$tmpdir/compose.yml" >/dev/null 2>&1; then
    exit 1
fi

printf '\n' >> "$tmpdir/state/previous-artifact-digests.json"
if bash "$repo_root/scripts/rollback-staging-digests.sh" \
    "$tmpdir/env" "$tmpdir/compose.yml" >/dev/null 2>&1; then
    exit 1
fi

manifest "$old_sha" "$tmpdir/state/current-artifact-digests.json"
rm "$tmpdir/state/current-artifact-digests.json.sha256"
if FAKE_REVISION="$new_sha" bash "$repo_root/scripts/deploy-staging-digests.sh" \
    "$tmpdir/new.json" "$tmpdir/env" "$tmpdir/compose.yml" >/dev/null 2>&1; then
    exit 1
fi

# A transient registry reset can recover without starting application services early.
manifest "$old_sha" "$tmpdir/state/current-artifact-digests.json"
sha256sum "$tmpdir/state/current-artifact-digests.json" \
    > "$tmpdir/state/current-artifact-digests.json.sha256"
export FAKE_REVISION="$new_sha"
export FAKE_PULL_COUNTER="$tmpdir/pull-count"
export PATCHWORK_DEPLOY_RUNTIME_CHANGE_MARKER="$tmpdir/runtime-started"
: > "$DOCKER_CALLS"
FAKE_PULL_FAILURES=2 bash "$repo_root/scripts/deploy-staging-digests.sh" \
    "$tmpdir/new.json" "$tmpdir/env" "$tmpdir/compose.yml" >/dev/null
[[ $(cat "$FAKE_PULL_COUNTER") -eq 3 && -e "$PATCHWORK_DEPLOY_RUNTIME_CHANGE_MARKER" ]]
grep -q -- '--parallel 1 pull' "$DOCKER_CALLS"
cmp -s "$tmpdir/new.json" "$tmpdir/state/current-artifact-digests.json"

# Exhaustion fails after three attempts, before migrations or runtime changes.
rm "$FAKE_PULL_COUNTER" "$PATCHWORK_DEPLOY_RUNTIME_CHANGE_MARKER"
: > "$DOCKER_CALLS"
cp "$tmpdir/state/current-artifact-digests.json" "$tmpdir/before.json"
if FAKE_PULL_FAILURES=99 bash "$repo_root/scripts/deploy-staging-digests.sh" \
    "$tmpdir/new.json" "$tmpdir/env" "$tmpdir/compose.yml" >/dev/null 2>&1; then
    exit 1
fi
[[ $(cat "$FAKE_PULL_COUNTER") -eq 3 && ! -e "$PATCHWORK_DEPLOY_RUNTIME_CHANGE_MARKER" ]]
if grep -Eq ' (up|run|stop) ' "$DOCKER_CALLS"; then exit 1; fi
cmp -s "$tmpdir/before.json" "$tmpdir/state/current-artifact-digests.json"
