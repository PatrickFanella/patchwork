#!/usr/bin/env bash
set -euo pipefail

env_file=${1:?Usage: rollback-staging-digests.sh ENV_FILE [COMPOSE_FILE]}
compose_file=${2:-docker-compose.staging.yml}
state_dir=${PATCHWORK_RELEASE_STATE_DIR:-/var/lib/patchwork/releases}
manifest="$state_dir/previous-artifact-digests.json"

[[ -r "$manifest" ]] || {
    echo 'No previous-artifact-digests.json is available.' >&2
    exit 1
}
for service in api indexer moderation web; do
    image=$(jq -er ".images.${service}" "$manifest")
    [[ "$image" =~ @sha256:[0-9a-f]{64}$ ]] || exit 1
    case "$service" in
        api) export PATCHWORK_API_IMAGE=$image ;;
        indexer) export PATCHWORK_INDEXER_IMAGE=$image ;;
        moderation) export PATCHWORK_MODERATION_IMAGE=$image ;;
        web) export PATCHWORK_WEB_IMAGE=$image ;;
    esac
done

compose=(docker compose --env-file "$env_file" -f "$compose_file")
"${compose[@]}" pull
"${compose[@]}" up -d --no-build --no-deps \
    patchwork-spool patchwork-thimble patchwork-api patchwork-web
for probe in 'patchwork-spool:4100' 'patchwork-thimble:4200' 'patchwork-api:4000'; do
    service=${probe%%:*}; port=${probe##*:}
    for attempt in {1..30}; do
        if "${compose[@]}" exec -T "$service" \
            wget -qO- "http://127.0.0.1:${port}/health/ready" >/dev/null 2>&1; then
            break
        fi
        [[ $attempt -lt 30 ]] || exit 1
        sleep 2
    done
done
cp "$manifest" "$state_dir/current-artifact-digests.json"
echo "Rolled staging back to $(jq -r '.gitSha' "$manifest")."
