# Capacity targets and executable probe

## Status

Patchwork has an executable HTTP capacity probe and one bounded local
PostgreSQL result. It does **not** yet have a validated staging capacity
envelope. The numbers below are local loopback measurements and must not be
used for production sizing, an alpha `GO`, or a reliability commitment.

The older shared contracts in `packages/shared/src/load-testing.ts` contain
modeled targets for alpha and deferred routes. They are inputs to evaluation,
not measurements. Former references to `performance.test.ts`,
`load-profile.test.ts`, and `capacity-service.test.ts` were incorrect: those
files do not exist.

## Current alpha read workload

`npm run capacity:probe` sends real HTTP GET requests to the configured API.
It measures response-body completion, status counts, errors, achieved
throughput, and p50/p95/p99 latency. The probe is paced rather than saturation
based so it compares the current alpha routes with their modeled minimums.

| Endpoint | Path | Target RPS | p95 budget | Maximum error rate |
| --- | --- | ---: | ---: | ---: |
| health | `/health` | 50 | 30 ms | 0% |
| map | `/query/map` | 60 | 400 ms | 0.5% |
| feed | `/query/feed` | 80 | 300 ms | 0.5% |
| directory | `/query/directory` | 40 | 350 ms | 0.5% |

Map and feed use the generated, non-private coordinate tuple `0,0` with a
25 km radius. Query strings are never accepted as route configuration or
included in probe output. Base URLs containing credentials are rejected.

## Running the probe

Run against an already deployed or isolated API; the probe never starts,
seeds, or modifies a service:

```bash
PATCHWORK_CAPACITY_BASE_URL=http://127.0.0.1:44127 \
PATCHWORK_CAPACITY_ENVIRONMENT=isolated-local-postgres \
PATCHWORK_CAPACITY_DURATION_SECONDS=5 \
PATCHWORK_CAPACITY_CONCURRENCY=4 \
PATCHWORK_CAPACITY_ENFORCE_BUDGETS=1 \
npm run capacity:probe
```

When a trusted local load generator needs multiple client identities to avoid
measuring only the per-IP abuse limiter, set
`PATCHWORK_CAPACITY_FORWARDED_FOR_POOL_SIZE` to at most 254 and configure the
API to trust only that generator address. The probe uses the reserved
documentation range `198.51.100.0/24`. Do not enable this option against an
untrusted proxy or general public endpoint.

The command exits nonzero for any response error. With
`PATCHWORK_CAPACITY_ENFORCE_BUDGETS=1`, it also exits nonzero when latency,
throughput, or error-rate targets fail.

## Local evidence, 2026-07-11

The isolated run used PostgreSQL 16.14, Node 24.15.0, an Apple M3 with 16 GiB
RAM, the complete 13/3/3 migration set, a fresh projection heartbeat, and
1,000 generated durable aid-post projections. Each route ran for five seconds
at concurrency four. The API used PostgreSQL data mode; test environment mode
disabled external OAuth only.

| Endpoint | Requests | Errors | Actual RPS | p50 | p95 | p99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| health | 250 | 0 | 50.11 | 9.31 ms | 13.18 ms | 15.00 ms |
| map | 300 | 0 | 60.07 | 10.62 ms | 13.54 ms | 15.12 ms |
| feed | 400 | 0 | 80.05 | 8.50 ms | 9.97 ms | 11.75 ms |
| directory | 200 | 0 | 40.06 | 10.73 ms | 15.67 ms | 20.02 ms |

All four modeled budgets passed. Full evidence and caveats are in
`docs/operations/evidence/phase-8/local-capacity-probe.md`.

## What remains unproven

This short loopback run does not measure network/TLS overhead, non-empty
directory data, concurrent writes, real ingestion, moderation queues,
database connection saturation, CPU or memory ceilings, sustained behavior,
multiple API replicas, or failure recovery under load. The staging `CAPACITY`
condition therefore remains open until a representative data set and complete
create/ingest/discover/moderate workload run long enough to measure resource
headroom and recovery on immutable staging artifacts.
