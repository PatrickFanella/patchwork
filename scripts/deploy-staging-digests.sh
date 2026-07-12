#!/usr/bin/env bash
set -euo pipefail

manifest=${1:?Usage: deploy-staging-digests.sh MANIFEST ENV_FILE [COMPOSE_FILE]}
env_file=${2:?Usage: deploy-staging-digests.sh MANIFEST ENV_FILE [COMPOSE_FILE]}
compose_file=${3:-docker-compose.staging.yml}
state_dir=${PATCHWORK_RELEASE_STATE_DIR:-/var/lib/patchwork/releases}

command -v jq >/dev/null
[[ -r "$manifest" && -r "$env_file" && -r "$compose_file" ]]

for service in api indexer moderation web; do
    image=$(jq -er ".images.${service}" "$manifest")
    [[ "$image" =~ @sha256:[0-9a-f]{64}$ ]] || {
        echo "Refusing non-digest image for ${service}." >&2
        exit 1
    }
    case "$service" in
        api) export PATCHWORK_API_IMAGE=$image ;;
        indexer) export PATCHWORK_INDEXER_IMAGE=$image ;;
        moderation) export PATCHWORK_MODERATION_IMAGE=$image ;;
        web) export PATCHWORK_WEB_IMAGE=$image ;;
    esac
done

install -d -m 0750 "$state_dir"
if [[ -f "$state_dir/current-artifact-digests.json" ]]; then
    cp "$state_dir/current-artifact-digests.json" \
        "$state_dir/previous-artifact-digests.json"
fi

compose=(docker compose --env-file "$env_file" -f "$compose_file")
"${compose[@]}" pull
"${compose[@]}" up -d --wait postgres
"${compose[@]}" run --rm --no-deps patchwork-api-migrations
"${compose[@]}" run --rm --no-deps patchwork-indexer-migrations
"${compose[@]}" run --rm --no-deps patchwork-moderation-migrations
"${compose[@]}" up -d --no-build --wait \
    patchwork-spool patchwork-thimble patchwork-api patchwork-web

for probe in \
    'patchwork-spool:4100' \
    'patchwork-thimble:4200' \
    'patchwork-api:4000'; do
    service=${probe%%:*}
    port=${probe##*:}
    "${compose[@]}" exec -T "$service" \
        wget -qO- "http://127.0.0.1:${port}/health/ready" >/dev/null
done

cp "$manifest" "$state_dir/current-artifact-digests.json"
echo "Staging deployment ready at $(jq -r '.gitSha' "$manifest")."
