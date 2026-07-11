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
principals, bounded content-type-aware JSON parsing, stable request IDs,
graceful draining, CSRF/perimeter enforcement, and query-string compatibility
route removal remain.
