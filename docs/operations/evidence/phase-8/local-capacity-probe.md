# Local PostgreSQL HTTP capacity probe

Date: 2026-07-11

Result: **local read-path targets passed; staging capacity remains unproven**.

## Workload

- isolated loopback API at a dedicated port;
- `API_DATA_SOURCE=postgres` with PostgreSQL 16.14;
- API/indexer/moderation migrations applied from empty at 12/3/3;
- fresh durable projection checkpoint and 1,000 generated aid-post rows;
- no fixture query service, external OAuth, private coordinates, credentials,
  user records, or home-network service reuse;
- Apple M3, 16 GiB RAM, Node 24.15.0;
- five seconds per route, four workers, paced target throughput;
- 254 reserved documentation client IPs through a locally trusted proxy
  boundary, preventing the per-IP abuse limiter from becoming the workload.

## Result

| Endpoint | Target/actual RPS | Requests | Errors | p50 | p95 | p99 | Budget |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| health | 50/50.11 | 250 | 0 | 9.31 ms | 13.18 ms | 15.00 ms | Pass |
| map | 60/60.07 | 300 | 0 | 10.62 ms | 13.54 ms | 15.12 ms | Pass |
| feed | 80/80.05 | 400 | 0 | 8.50 ms | 9.97 ms | 11.75 ms | Pass |
| directory | 40/40.06 | 200 | 0 | 10.73 ms | 15.67 ms | 20.02 ms | Pass |

Command:

```bash
PATCHWORK_CAPACITY_BASE_URL=http://127.0.0.1:44127 \
PATCHWORK_CAPACITY_ENVIRONMENT=isolated-local-postgres-1000-projections \
PATCHWORK_CAPACITY_DURATION_SECONDS=5 \
PATCHWORK_CAPACITY_CONCURRENCY=4 \
PATCHWORK_CAPACITY_FORWARDED_FOR_POOL_SIZE=254 \
PATCHWORK_CAPACITY_ENFORCE_BUDGETS=1 \
npm run capacity:probe
```

## Interpretation

This proves the current PostgreSQL-backed alpha read handlers can meet the
modeled rates for a short generated-data run on this machine. It does not
establish a safe operating maximum: the test did not seek saturation, collect
CPU/memory/database resource series, include network/TLS, run writes or
ingestion, use a populated directory, or execute on deployment artifacts.

The Phase 8 `CAPACITY` condition remains `NO-GO` pending a sustained staging
run that includes the real create-to-projection workflow, moderation traffic,
resource headroom, and recovery behavior.
