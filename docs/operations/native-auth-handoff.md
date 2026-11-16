# Native OAuth handoff

Implements #248. Existing browser OAuth, CSRF, managed signup, refresh and logout
keep their existing routes. Provider/PDS tokens stay in the encrypted server
session store. Native apps receive only an opaque Patchwork bearer token.

## Configuration

`API_NATIVE_CALLBACK_URLS` is an exact comma-separated callback allowlist.
Empty disables native sign-in with `NATIVE_AUTH_UNAVAILABLE`. Configure an
owned app scheme or verified HTTPS app link per build environment; no app
identifier ownership or store registration is established by this change.
Do not allow arbitrary return URLs, query strings, fragments or embedded
credentials. Production native start/exchange require an HTTPS public origin.
TLS termination remains the deployment's responsibility.

## Caller protocol

1. Generate a cryptographically random 43–128-character PKCE verifier and a
   separate random 32–128-character base64url state. Keep both in app memory.
2. POST `/auth/native/start` over HTTPS with JSON:
   `{ "handle": "member.example", "redirectUri": "org.example.patchwork://oauth/callback", "state": "sssssssssssssssssssssssssssssssssssssssssss", "codeChallenge": "w1TpKUdYE9hUAcNSeeSRFioHDxfUxuHho_JHAfZ_vDM" }`.
   The `org.example` callback is a reserved test identity used by the executable
   integration caller, not a claimed Patchwork package identifier. This synthetic challenge uses a verifier consisting of 64 `v` characters;
   real callers must generate a fresh random verifier, not copy the test value.
   The response is `{ "authorizationUrl": "provider authorization URL" }`.
3. Open the authorization URL in the system authentication browser. Provider
   authorization returns to the existing `/oauth/callback`. The OAuth client's
   server-side state binds the native request; the initiating flow expires in
   ten minutes. Successful completion redirects to the allowlisted callback
   with only `code` and `state`. It sets no Patchwork browser cookies.
4. Verify callback state in the app. POST `/auth/native/exchange` over HTTPS
   with JSON `{ code, codeVerifier, redirectUri, state }`. It returns
   `{ tokenType: "Bearer", sessionToken, expiresAt }`, with a one-hour maximum
   session lifetime. Store the token only in platform-protected storage.
5. Send `Authorization: Bearer <sessionToken>` to the existing protected routes.
   `/auth/refresh` validates the provider session without extending token life;
   `DELETE /auth/session` revokes access. Account deletion invalidates it through
   the same session repository and account lock used by browser sessions.

Start/exchange accept no existing bearer or browser session credentials. A
protected request carrying different cookie and bearer values is rejected by
the existing authentication boundary. Browser writes still require origin and
CSRF verification. Native routes use the existing auth rate limiter.

Completion codes expire after 60 seconds and are stored only as SHA-256 hashes.
Exchange atomically deletes the row only when verifier/callback/state match;
concurrent exchanges, replay, expiry and mismatches fail closed. Expired rows
are removed by retention. A lost exchange response requires a new login; do
not retry or log tokens. Redirects and exchange responses use `no-store`, and
callbacks set `no-referrer`. Do not log request bodies, codes or callback URLs.

## Executable verification

`node scripts/test-database.mjs services/api/src/auth/native-handoff.postgres.test.ts`
runs the initiating caller, shared production OAuth completion responder and
native HTTP handler against disposable PostgreSQL. It tests bearer authority,
refresh/logout, conflicting credentials, mismatches, expiry and concurrent
replay. The provider adapter is a deterministic double: this does not qualify
real-provider consent, app-link delivery, physical phones or browser sessions
on a live service. Run the auth/CSRF/unit suites as well. Security review and
real-provider evidence remain separate release checkpoints; no deployment is
included.

Local verification: all workspace typechecks passed; 109 focused auth/session,
CSRF and client unit tests, 50 rate-limiter/config tests, two native binding
unit tests and nine disposable PostgreSQL native/session/retention tests passed.
The PostgreSQL caller also checks the shared browser completion responder's
secure session/CSRF cookies and sanitized return path.
