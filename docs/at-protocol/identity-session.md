# DID auth, handle resolution, and session refresh (Phase 2 / P2.2)

This document describes the baseline identity/session lifecycle implemented in Phase 2.

## Module

- `packages/shared/src/identity.ts`

## Lifecycle

1. **Handle input validation**
    - Handle must be DNS-like (`alice.example`).
2. **Handle resolution**
    - Resolve handle to DID + PDS URL through an identity provider.
3. **Session creation**
    - Create an authenticated session using resolved DID.
4. **Pre-expiry refresh**
    - Refresh session when access token is inside refresh-leeway window.
5. **Expiry handling**
    - If refresh token expiry has passed, flow fails with explicit `SESSION_EXPIRED`.

## Error model

Structured error codes are emitted via `DidAuthError`:

- `INVALID_HANDLE`
- `INVALID_DID`
- `HANDLE_RESOLUTION_FAILED`
- `SESSION_CREATE_FAILED`
- `SESSION_REFRESH_FAILED`
- `SESSION_EXPIRED`

## Test evidence

Integration tests are in:

- `packages/shared/src/identity.test.ts`

Covered cases:

- successful login
- handle resolution failure
- refresh before expiry
- refresh-token-expired path
