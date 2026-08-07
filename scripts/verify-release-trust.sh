#!/usr/bin/env bash
# Verify every immutable image and required attestation before deployment.

set -Eeuo pipefail

manifest=${1:?Usage: verify-release-trust.sh MANIFEST}
mode=${PATCHWORK_RELEASE_VERIFY_MODE:?Set PATCHWORK_RELEASE_VERIFY_MODE to keyless or key}
allowed_prefix=${PATCHWORK_ALLOWED_IMAGE_PREFIX:?Set PATCHWORK_ALLOWED_IMAGE_PREFIX}
require_attestations=${PATCHWORK_REQUIRE_RELEASE_ATTESTATIONS:-true}
allow_insecure_registry=${PATCHWORK_COSIGN_ALLOW_INSECURE_REGISTRY:-false}
ignore_transparency_log=${PATCHWORK_COSIGN_INSECURE_IGNORE_TLOG:-false}

for command in jq cosign; do
    command -v "$command" >/dev/null
done
[[ -r "$manifest" ]]

case "$mode" in
    keyless)
        identity=${PATCHWORK_COSIGN_CERTIFICATE_IDENTITY_REGEXP:?Set certificate identity regexp}
        issuer=${PATCHWORK_COSIGN_CERTIFICATE_OIDC_ISSUER:-https://token.actions.githubusercontent.com}
        verify_args=(
            --certificate-identity-regexp "$identity"
            --certificate-oidc-issuer "$issuer"
        )
        ;;
    key)
        public_key=${PATCHWORK_COSIGN_PUBLIC_KEY:?Set PATCHWORK_COSIGN_PUBLIC_KEY}
        [[ -r "$public_key" ]]
        verify_args=(--key "$public_key")
        ;;
    *)
        echo 'PATCHWORK_RELEASE_VERIFY_MODE must be keyless or key.' >&2
        exit 2
        ;;
esac

if [[ "$allow_insecure_registry" == true ]]; then
    verify_args+=(--allow-insecure-registry)
fi
if [[ "$ignore_transparency_log" == true ]]; then
    verify_args+=(--insecure-ignore-tlog)
fi

git_sha=$(jq -er '.gitSha' "$manifest")
[[ "$git_sha" =~ ^[0-9a-f]{40}$ ]]

for service in api indexer moderation web; do
    image=$(jq -er ".images.${service}" "$manifest")
    [[ "$image" == "$allowed_prefix"* && "$image" =~ @sha256:[0-9a-f]{64}$ ]] || {
        echo "Refusing image outside the allowed registry/repository prefix: ${service}." >&2
        exit 3
    }
    cosign verify "${verify_args[@]}" "$image" >/dev/null
    if [[ "$require_attestations" == true ]]; then
        for attestation_type in spdxjson slsaprovenance; do
            cosign verify-attestation "${verify_args[@]}" \
                --type "$attestation_type" "$image" >/dev/null
        done
    fi
done

printf 'Release trust verified for %s.\n' "$git_sha"
