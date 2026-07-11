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

This does not yet satisfy the command-body checklist because unsafe legacy
query-string mutation and credential routes still exist and must be removed.
