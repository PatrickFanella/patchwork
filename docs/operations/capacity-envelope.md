# Capacity Envelope -- Patchwork Platform

## Overview

This document defines the safe operating envelope for Patchwork services,
based on load test profiles and performance budgets defined in code at
`packages/shared/src/load-testing.ts`.

Load tests are repeatable via `vitest run` against the API service test
suite (`services/api/src/performance.test.ts`, `services/api/src/load-profile.test.ts`).

## Load Test Profiles

Each endpoint has three load tiers:

| Endpoint | Tier | Concurrent Users | Target RPS | Duration (s) |
|---|---|---|---|---|
| feed | baseline | 10 | 20 | 60 |
| feed | peak | 50 | 100 | 120 |
| feed | stress | 200 | 400 | 60 |
| map | baseline | 10 | 15 | 60 |
| map | peak | 50 | 80 | 120 |
| map | stress | 150 | 300 | 60 |
| chat | baseline | 5 | 10 | 60 |
| chat | peak | 30 | 60 | 120 |
| chat | stress | 100 | 200 | 60 |
| moderation | baseline | 3 | 5 | 60 |
| moderation | peak | 15 | 30 | 120 |
| moderation | stress | 50 | 100 | 60 |
| directory | baseline | 5 | 10 | 60 |
| directory | peak | 25 | 50 | 120 |
| directory | stress | 80 | 160 | 60 |
| health | baseline | 2 | 5 | 30 |
| health | peak | 10 | 20 | 60 |
| health | stress | 30 | 60 | 30 |

## Performance Budgets (Latency Targets)

| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) | Max Error Rate | Min Throughput (rps) |
|---|---|---|---|---|---|
| feed | 100 | 300 | 800 | 0.5% | 80 |
| map | 150 | 400 | 1000 | 0.5% | 60 |
| chat | 80 | 250 | 600 | 0.2% | 40 |
| moderation | 200 | 500 | 1200 | 1.0% | 20 |
| directory | 120 | 350 | 900 | 0.5% | 40 |
| health | 10 | 30 | 80 | 0.0% | 50 |

## Bottleneck Detection Thresholds

| Resource | Threshold | Action |
|---|---|---|
| Memory saturation | > 85% heap usage | Flag memory bottleneck |
| Event loop delay | > 100ms | Flag event-loop bottleneck |
| p99 latency | > 1000ms | Flag CPU/compute bottleneck |

## Scaling Recommendations

### Horizontal Scaling

- Add API replicas behind a load balancer when any endpoint fails its
  stress tier budget. The capacity service (`services/api/src/capacity-service.ts`)
  automatically identifies which endpoints need horizontal scaling.

### Vertical Scaling

- Increase Node.js heap (`--max-old-space-size`) if memory saturation
  exceeds 85% during peak load.
- Move CPU-intensive operations (ranking, geo calculations) to worker
  threads if event loop delay exceeds 100ms.

### Caching

- Feed and map endpoints benefit from read-through caches (TTL 5-30s)
  to reduce computation under high read traffic.
- Directory queries are highly cacheable due to slow-changing data.

## Running Load Tests

```bash
# Run all performance and capacity tests
npm run test -w @patchwork/api

# Run only performance budget validation
npx vitest run src/performance.test.ts -w services/api

# Run load profile structural validation
npx vitest run src/load-profile.test.ts -w services/api

# Run capacity service unit tests
npx vitest run src/capacity-service.test.ts -w services/api
```

## Capacity Envelope Schema

The capacity envelope is defined programmatically in
`packages/shared/src/load-testing.ts` as the `CapacityEnvelope` type.
It includes:

- **limits**: Per-endpoint maximum concurrent users, RPS, and resource
  saturation ceilings.
- **bottlenecks**: Detected resource constraints with symptoms and
  recommendations.
- **scalingRecommendations**: Ordered list of scaling actions to take
  when approaching capacity limits.

## Gap Tracking

When load test results identify performance budget violations, they are
tracked as violations in the `evaluateBudget()` function output. Gaps
should be addressed before promoting to production:

1. Run `vitest run src/performance.test.ts` to identify violations.
2. Review violation messages for the specific metric and threshold.
3. Apply the matching scaling recommendation from the capacity envelope.
4. Re-run the load test to verify the fix.
