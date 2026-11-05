#!/usr/bin/env bash
# Dispatch the existing protected release only after exact-main push CI passes.
set -Eeuo pipefail

: "${GITEA_TOKEN:?Set GITEA_TOKEN}"
: "${GITHUB_SHA:?Set GITHUB_SHA}"
[[ "${GITHUB_EVENT_NAME:-}" == push && "${GITHUB_REF:-}" == refs/heads/main ]] || {
    echo 'Automatic deployment requires a push to main.' >&2
    exit 1
}
[[ "${SOURCE_SHA:-}" == "$GITHUB_SHA" ]] || {
    echo 'Deployment source must match this CI commit.' >&2
    exit 1
}

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
bash "$script_dir/verify-gitea-source.sh"
payload=$(jq -cn --arg sha "$SOURCE_SHA" '{ref:"main",inputs:{source_sha:$sha}}')
curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
    --request POST \
    --header "Authorization: token $GITEA_TOKEN" \
    --header 'Content-Type: application/json' \
    --data "$payload" \
    "$GITHUB_SERVER_URL/api/v1/repos/$GITHUB_REPOSITORY/actions/workflows/deploy-staging.yml/dispatches"
echo "Requested protected staging deployment for $SOURCE_SHA."
