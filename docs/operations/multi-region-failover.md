# Multi-region failover procedures

## Overview

The Patchwork platform supports multi-region deployment with automatic and manual failover capabilities. This document describes the failover procedures, configuration, and testing approach.

## Region topology

| Region | Identifier | Primary use |
|---|---|---|
| US East | `us-east` | Primary US region |
| US West | `us-west` | US failover / West Coast users |
| EU West | `eu-west` | EU primary, GDPR compliance |
| EU Central | `eu-central` | EU failover |
| AP Southeast | `ap-southeast` | Asia-Pacific primary |
| AP Northeast | `ap-northeast` | Asia-Pacific failover |

## Failover modes

### Automatic failover

- Health checks run at a configurable interval (default 30s).
- When consecutive failures reach the unhealthy threshold (default 3), the system automatically routes traffic to the next region in the failover chain.
- The failed region's endpoint is marked inactive.
- Failback occurs automatically when the region recovers and passes the healthy threshold (default 2 consecutive healthy checks).

### Manual failover

- Operators explicitly trigger failover via the tenant service API.
- Use this mode when you need full control over region switching (e.g., planned maintenance, compliance-driven migration).

### Disabled

- No failover occurs. Traffic is always routed to the primary region.
- Use this only for single-region deployments or during initial setup.

## Failover chain configuration

Each tenant configures an ordered failover chain. Example:

```json
{
  "tenantId": "tenant-001",
  "mode": "automatic",
  "healthCheckIntervalMs": 30000,
  "unhealthyThreshold": 3,
  "healthyThreshold": 2,
  "failoverChain": ["us-west", "eu-west"],
  "maxFailoverAttempts": 3
}
```

When `us-east` (primary) fails, traffic moves to `us-west`. If `us-west` also fails, traffic moves to `eu-west`.

## Data residency during failover

- **region-locked**: Failover is limited to the primary region. If the primary is down, the tenant is unavailable until recovery. This mode is used for strict compliance (e.g., data sovereignty requirements).
- **region-preferred**: Failover routes to other allowed regions. Data may be cached in the failover region but primary storage remains in the original region.
- **global**: Failover can route to any region. Data may be replicated across regions.

## Failover event audit trail

All failover events are recorded with:
- Event type (`failover_initiated`, `failover_completed`, `failover_failed`, `failback_initiated`, `failback_completed`, `health_check_failed`, `health_check_recovered`)
- Source and target regions
- Reason for the event
- Timestamp

## Policy overrides during failover

Region-specific policy overrides remain active during failover. If traffic moves from `us-east` to `eu-west`, the `eu-west` policy overrides (e.g., GDPR compliance settings) apply automatically.

## Testing failover behavior

### Unit test approach

1. Create a tenant with multi-region configuration.
2. Simulate health check failures by calling `updateRegionHealth` with `isHealthy: false`.
3. Verify that routing decisions shift to failover regions.
4. Simulate recovery and verify failback.

### Integration test approach

1. Deploy the tenant service with a multi-region configuration.
2. Shut down the primary region endpoint.
3. Verify that the routing decision returns a failover region.
4. Verify failover events are recorded in the audit trail.
5. Restore the primary region and verify failback.

## Runbook: manual failover

1. **Assess**: Check region health via `getAllRegionHealth(tenantId)`.
2. **Decide**: Identify the target failover region from the failover chain.
3. **Execute**: Update region health to mark the failed region as unhealthy, or directly update the routing policy to point to the target region.
4. **Verify**: Call `resolveRoute(tenantId)` to confirm traffic is routing to the new region.
5. **Monitor**: Watch failover events and health checks for the failed region.
6. **Failback**: Once the failed region recovers, update its health status to healthy. Automatic failback will restore it if configured.

## Monitoring and alerting

- Monitor `patchwork_sli_request_total` per region for traffic distribution.
- Alert on consecutive health check failures approaching the unhealthy threshold.
- Alert on failover events (especially `failover_failed`).
- Track failover event frequency to detect region instability.
