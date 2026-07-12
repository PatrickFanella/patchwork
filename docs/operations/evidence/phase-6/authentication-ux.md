# Phase 6 authentication UX evidence

Date: 2026-07-11

## Runtime behavior

- `AuthProvider` restores the HttpOnly cookie session at application startup
  and owns anonymous, redirecting, authenticated, refreshing, expired, and
  recoverable-error states.
- Browser-visible session state contains only the authenticated DID and
  browser-session expiration. OAuth access and refresh material remains in the
  encrypted server-side SDK store.
- Login sends a handle and sanitized internal destination to the API. The API
  returns an opaque authorization URL for SPA navigation while preserving its
  redirect response for non-JavaScript clients.
- Return destinations reject external paths, discard fragments, and remove
  token, authorization-code, state, and session-like query keys in both web and
  server boundaries.
- Successful callback redirects to the configured web origin, sets the
  HttpOnly session and same-site CSRF cookies, and never places tokens in the
  URL. Callback failure redirects only a stable error code.
- Refresh and logout use credentialed requests plus the readable double-submit
  CSRF cookie. A timer-overflow regression for long-lived sessions was found by
  the provider integration test and fixed with a safe scheduling cap.
- Posting, chat, and settings no longer use the hard-coded fixture DID; they
  require the restored authenticated identity.
- The old `auth-ux` model and tests containing access/refresh-token-shaped
  browser state were removed.

## Recovery and accessibility

- PDS unavailability offers retry guidance.
- Denied authorization explains that a new login is safe.
- Stale callback state cannot be reused and links to a fresh login.
- Expired sessions are announced and direct the user to sign in again.
- The login handle has an explicit label and autocomplete semantics; status
  changes use live regions; failures use `role=alert`; all recovery actions are
  native keyboard-operable controls.
- Callback query parameters are scrubbed from browser history and never
  reflected into page content.

## Verification

- API/web auth focused suites: green, including 10 web flow cases and stable
  OAuth error mapping.
- All 16 migrations apply from empty and replay without changes.
- Database-enabled `npm run check`: 820 tests passed.
- `npm run build`: passed.
- Diagnostic coverage: 779 passed and 41 database tests skipped; 58.93%
  statements, 46.31% branches, 52.33% functions, and 60.08% lines.
- Direct service integration: 9 passed.
- Chromium accessibility: 35 passed, including login form and route checks.
- `npm audit --omit=dev`: zero vulnerabilities.

PostgreSQL ran only in the disposable container bound to
`127.0.0.1:5433`; the existing home-network database was untouched.

## Remaining Phase 6 work

This completes Task 6.1 locally. It does not claim a live OAuth authorization
or callback. Task 6.2 must remove production fixture fallback. Task 6.3 and the
phase exit gate require two real browser sessions against PostgreSQL and
disposable test-PDS accounts.
