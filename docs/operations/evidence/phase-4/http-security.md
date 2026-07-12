# Phase 4 HTTP security evidence

Date: 2026-07-11

## Method-aware routing checkpoint

The API handler table is registered by explicit HTTP method and pathname.
Known paths with unsupported methods return `405` and an exact `Allow` header;
unknown paths remain `404`. A loopback HTTP integration test exercises the real
Node server rather than only the router module.

Verification:

```text
npm test -w @patchwork/api -- --run src/http/router.test.ts src/http/api-server-routing.test.ts
npm run check
```

This checkpoint does not claim the Phase 4 exit gate. Centralized session
principals, graceful draining, CSRF/perimeter enforcement, and query-string
compatibility route removal remain.

## Bounded JSON and stable-error checkpoint

All JSON body consumers, including the separately composed durable lifecycle
handler, now share one parser. It requires `application/json` (including JSON
suffix media types), rejects declared or streamed bodies above one mebibyte,
and maps malformed input to `400`. The real loopback server tests `400`, `413`,
and `415` behavior. Every JSON error response receives a new server-generated
request ID, while unknown exceptions map to a fixed message; a unit test proves
that internal exception text is absent.

The later compatibility-removal checkpoint closes the remaining command-body
gap.

## Central authenticated-principal checkpoint

The durable alpha command paths now share `authenticateRequest()`. It accepts a
single opaque bearer or browser-cookie session, rejects missing, malformed, or
conflicting credentials, resolves the session and PostgreSQL role once at the
edge, and provides handlers a deeply frozen principal and capability context.
AT-record, block/report, lifecycle transition, assignment response, and handoff
handlers no longer parse identity independently or construct authorization from
body fields. PostgreSQL HTTP coverage includes missing and expired sessions,
durable role elevation, and hostile body identity fields.

The later compatibility-removal checkpoint removes the routes that bypassed
this boundary.

## Graceful shutdown checkpoint

SIGTERM and SIGINT now share an idempotent shutdown operation. The Node server
stops accepting connections immediately, drains active requests, and closes the
PostgreSQL pool only after the drain. A 30-second deadline force-closes remaining
connections so orchestration cannot hang indefinitely. A real-server test holds
one request open, proves a new connection is refused, releases the request, and
then proves exactly-once resource closure.

## Browser perimeter checkpoint

All API responses now include a deny-by-default CSP, frame denial, MIME sniffing
protection, no-referrer policy, restricted browser permissions, and same-site
resource policy; production also sends one-year HSTS. Cookie-authenticated
mutations require the configured origin and equal `patchwork_csrf` cookie/header
tokens compared in constant time. Login issues a distinct Strict CSRF cookie
alongside the HttpOnly session cookie, production marks both Secure, logout
clears both, CORS admits the CSRF header, and the web client supplies it.

Pure perimeter tests and a real HTTP server test prove header emission and CSRF
rejection. The following checkpoint adds proxy and rate-limit policy evidence.

## Trusted proxy and rate-limit checkpoint

`API_TRUSTED_PROXIES` is an explicit comma-separated exact-IP/IPv4-CIDR allow
list. Without a matching socket peer, `X-Forwarded-For` is ignored. Even a
trusted peer may supply only one syntactically valid address; multi-hop chains
fall back to the socket peer, preventing client-controlled prefix spoofing.
Production and staging Compose expose separate trust configuration.

The API now selects separate one-minute budgets for login/auth, reads, ordinary
writes, reports, and moderation. Tests prove route selection, report exhaustion
before ordinary writes, window reset, untrusted forwarding rejection, trusted
single-hop acceptance, and forwarded-chain rejection. Credentialed CORS is
emitted only for an exactly allowed origin and never uses a wildcard.

The compatibility-removal and service-auth checkpoints below close capability
enforcement for the routes that remain.

## Unsafe compatibility removal checkpoint

The API contract and runtime now expose only the narrow durable alpha surface.
Deferred fixture-backed chat, settings, verification, organizations, inbox,
feedback, reputation, volunteer, and attachment endpoints were removed rather
than promoted without persistence or authorization. OAuth login is POST JSON;
the OAuth callback retains only protocol-defined query parameters. Moderation
mutations and private state/audit lookups are method-aware JSON bodies, and its
fixture runtime returns `503` instead of mutating process memory.

The web posting path now uses authenticated `POST /at/aid-posts`, rounds public
coordinates, and enforces at least 1 km precision. A repository test scans API
and moderation runtime entrypoints and fails on `FromParams`, body-field query
parsing, or sensitive query keys. The following checkpoint closes authenticated
service-to-service moderation; effectful idempotency-key enforcement remains.

## Moderation service-auth checkpoint

The API is now the browser-facing moderation boundary. It restores the opaque
session, resolves the PostgreSQL role, requires `moderate:content`, removes any
body-supplied actor fields, and forwards the authenticated DID. The worker is
reachable only on the internal Compose network and accepts moderation commands
only with a constant-time validated service bearer credential. Production API
and worker startup fail if their shared boundary configuration is absent.

Unit coverage proves the forwarded credential and actor replacement. Live
worker HTTP coverage proves missing credentials return `401`; under PostgreSQL,
the immutable audit entry records the gateway actor rather than the hostile
body actor. Worker error logging emits only a fixed event and route pathname.
The remaining Phase 4 gap is effectful idempotency enforcement across every
mutation.
