#!/usr/bin/env bash
# Read only the dedicated root-owned test-account store over the deploy identity.
set -Eeuo pipefail
: "${STAGING_SSH_USER:?Set STAGING_SSH_USER}"
: "${STAGING_SSH_HOST:?Set STAGING_SSH_HOST}"
: "${STAGING_PUBLIC_ORIGIN:?Set STAGING_PUBLIC_ORIGIN}"
[[ "$STAGING_SSH_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]
[[ "$STAGING_SSH_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "${STAGING_SSH_USE_SUDO:-false}" =~ ^(true|false)$ ]]
[[ "$STAGING_PUBLIC_ORIGIN" == https://patchwork.subcult.tv ]]

umask 077
scratch=$(mktemp -d "${RUNNER_TEMP:-/tmp}/patchwork-e2e.XXXXXXXX")
trap 'rm -rf -- "$scratch"' EXIT
reader='bash -se'
[[ "${STAGING_SSH_USE_SUDO:-false}" != true ]] || reader="sudo -n $reader"
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 \
    "$STAGING_SSH_USER@$STAGING_SSH_HOST" "$reader" > "$scratch/accounts.json" <<'REMOTE'
accounts=/etc/patchwork/e2e-accounts/accounts.json
[[ $(stat -c '%u:%a' "$accounts") == 0:600 ]]
cat "$accounts"
REMOTE
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PATCHWORK_E2E_BASE_URL="$STAGING_PUBLIC_ORIGIN" \
    node --import tsx "$script_dir/bootstrap-staging-sessions.mjs" "$scratch/accounts.json" "$scratch/states"
