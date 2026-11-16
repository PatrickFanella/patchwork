#!/bin/sh
set -eu
if [ "${CONFIGURATION:-}" = Release ]; then
    case "${PATCHWORK_BUNDLE_ID:-}" in
        ''|org.example.*) echo 'Release requires an explicitly owned PATCHWORK_BUNDLE_ID.' >&2; exit 1 ;;
    esac
    case "${PATCHWORK_API_BASE_URL:-}" in
        https://*) ;;
        *) echo 'Release requires an explicit HTTPS PATCHWORK_API_BASE_URL.' >&2; exit 1 ;;
    esac
fi
