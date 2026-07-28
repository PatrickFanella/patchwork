# NUC home-staging capacity evidence

Date: 2026-07-28 (America/Chicago)

Result: **the bounded home-staging `CAPACITY` condition passed at 40 aggregate
read RPS; production sizing remains unproven**.

## System under test

The NUC ran the scanned and signed four-image release built from
`995338c584524a84c2365c6a5658a6242399fd10`. API, indexer, moderation, and web
containers all reported that revision and remained healthy. Almaz was used
only as the existing trusted edge/load origin. This matters because Patchwork
honors forwarded client identities only from configured trusted proxies; a
NUC-origin canary correctly measured the per-IP abuse limiter instead.

The committed aggregate record is `staging-capacity.json`. It contains no DID,
handle, credential, token, cookie, exact location, report detail, subject URI,
connection string, or hostname-specific secret.

## Envelope search

The higher modeled aggregate target is 230 RPS across health, map, feed, and
directory. A trusted-edge canary at that target completed without HTTP errors
but did not achieve the requested per-route throughput and exceeded the
latency envelope. It is not recorded as a pass. A 20-RPS-per-route canary
completed 2,400 requests without errors, but p95 ranged from 939 to 1,458 ms
and host CPU approached the guardrail. It was also rejected.

The accepted run executed all four routes concurrently at 10 RPS each for 300
seconds:

| Route | Requests | Errors | Actual RPS | p95 |
| --- | ---: | ---: | ---: | ---: |
| health | 3,000 | 0 | 10 | 57.775 ms |
| map | 3,000 | 0 | 10 | 69.001 ms |
| feed | 3,000 | 0 | 10 | 85.574 ms |
| directory | 3,000 | 0 | 10 | 71.603 ms |

The accepted claim is therefore a 40-RPS aggregate safe operating point for
this home-staging topology. It does not satisfy or replace the higher modeled
targets.

## Mixed write and moderation workload

During the same five-minute read interval, three independent pairs of
disposable users completed the production browser path: signup, OAuth,
cookie-only Patchwork session, AT record creation, Jetstream ingestion,
projection/discovery, report, block, resolve/close, and CID-aware deletion.
The full journeys completed in 15.3, 13.8, and 11.3 seconds. Using the longest
whole-journey duration as a deliberately conservative projection upper bound
still passed the 30-second staging gate.

Three unique synthetic moderation subjects were enqueued and resolved through
the authenticated internal production service. Maximum observed queue age was
0.356 seconds. No private report marker or synthetic subject identifier is
retained in this evidence.

## Headroom, reliability, and cleanup

Prometheus and direct host/database observations recorded:

- maximum NUC host CPU: 65.30%;
- minimum host-memory headroom: 58.98%;
- minimum disk headroom: 41%;
- maximum Patchwork container memory: 1.4%;
- maximum PostgreSQL connection use: 35%;
- maximum event-source lag: 0.032 seconds;
- service restart, HTTP error, and ingestion error deltas: zero; and
- post-workload readiness recovery: 0.047 seconds.

Six workload accounts were deactivated through the production Patchwork
account endpoint and all six, plus one diagnostic-only account, were deleted
from the PDS. Aggregate database verification found zero OAuth sessions,
browser sessions, workflows, roles, owned blocks, raw operational-audit
actors, aid projections, directory projections, live safety reports,
moderation queue items, or moderation audit items for the disposable set.
Expected policy-bounded records remained: six hashed deactivation receipts,
six deactivation command receipts, and three deleted/redacted safety reports.
All disposable local and remote secret-bearing files were then removed.

## Boundary

This closes `CAPACITY` for the authorized single-NUC home-staging topology at
the observed envelope. It does not prove a maximum, production capacity,
multi-replica scaling, regional failover, independent database headroom, or
behavior above 40 aggregate read RPS. Patchwork remains `NO-GO` because formal
retention approval, independent accessibility review, named ownership, and
the pilot-or-closure decision are still absent.
