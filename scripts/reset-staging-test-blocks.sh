#!/usr/bin/env bash
set -euo pipefail
: "${STAGING_SSH_USER:?Set STAGING_SSH_USER}"
: "${STAGING_SSH_HOST:?Set STAGING_SSH_HOST}"
run_id=${GITHUB_RUN_ID:-manual}
[[ "$STAGING_SSH_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]
[[ "$STAGING_SSH_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "$run_id" =~ ^(manual|[0-9]+)$ ]]
remote_shell='python3 -'
if [[ "${STAGING_SSH_USE_SUDO:-false}" == true ]]; then
    remote_shell='sudo -n python3 -'
fi
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes \
    "$STAGING_SSH_USER@$STAGING_SSH_HOST" "$remote_shell '$run_id'" \
    < "$(dirname "$0")/reset-staging-test-blocks.py"
