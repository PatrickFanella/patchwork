# Integrations framework and connector governance

## Overview

The Patchwork integrations framework enables external ecosystem integrations with municipal services (311), crisis lines, community systems, and other service providers. The framework provides a standardized connector SDK, marketplace registry, retry/audit model, and governance rules.

## Connector SDK

### ConnectorContract interface

Every connector must implement the `ConnectorContract` interface:

```typescript
interface ConnectorContract {
  connectorId: string;
  initialize(config: Record<string, unknown>): Promise<void>;
  syncInbound(): Promise<SyncFlowRecord>;
  syncOutbound(payload: unknown): Promise<SyncFlowRecord>;
  healthCheck(): Promise<ConnectorHealthCheck>;
  shutdown(): Promise<void>;
}
```

### Lifecycle states

Connectors progress through the following states:

```
registered -> configured -> active -> paused -> decommissioned
                              |                      ^
                              +----> error -----------+
```

- **registered**: Connector definition added to the registry.
- **configured**: An instance has been created with tenant-specific configuration.
- **active**: Instance is running and processing syncs.
- **paused**: Instance is temporarily stopped (e.g., maintenance).
- **error**: Instance encountered persistent failures.
- **decommissioned**: Instance is permanently retired.

## Sync flows

### Direction

- **inbound**: Pull data from external system into Patchwork.
- **outbound**: Push data from Patchwork to external system.
- **bidirectional**: Connector supports both directions.

### Sync status

```
pending -> in_progress -> completed
                |
                +-------> retrying -> completed
                |                  -> failed
                +-------> skipped
                +-------> failed
```

## Retry policies

Three retry strategies are supported:

| Strategy | Description |
|---|---|
| `fixed-delay` | Wait a fixed duration between retries. |
| `exponential-backoff` | Double (or multiply) the delay after each retry. |
| `linear-backoff` | Increase the delay linearly with each retry. |

Configuration:

```typescript
{
  strategy: 'exponential-backoff',
  maxRetries: 3,           // 0-10
  initialDelayMs: 1000,    // 100-60000
  maxDelayMs: 60000,       // 1000-300000
  backoffMultiplier: 2     // 1-10
}
```

Delay calculation:
- **fixed-delay**: `min(initialDelayMs, maxDelayMs)`
- **exponential-backoff**: `min(initialDelayMs * multiplier^attempt, maxDelayMs)`
- **linear-backoff**: `min(initialDelayMs * (attempt + 1), maxDelayMs)`

## Audit trail

All connector lifecycle and sync operations are recorded in an audit trail. Audit actions include:

| Action | When recorded |
|---|---|
| `connector_registered` | New connector added to registry |
| `connector_configured` | Instance created for a tenant |
| `connector_activated` | Instance activated |
| `connector_paused` | Instance paused |
| `connector_decommissioned` | Instance retired |
| `sync_started` | Sync operation begins |
| `sync_completed` | Sync operation finishes successfully |
| `sync_failed` | Sync operation fails after all retries |
| `sync_retried` | Individual retry attempt |
| `health_check_passed` | Health check succeeds |
| `health_check_failed` | Health check fails |
| `config_updated` | Instance configuration changed |
| `credentials_rotated` | Instance credentials rotated |

## Marketplace registry

### Listing states

```
draft -> published -> deprecated -> removed
```

### Listing metadata

- Display name, short/full descriptions
- Icon URL, documentation URL, support URL
- Tags (max 20)
- Install count, rating (0-5)

## Production connectors

### Crisis Line Connector (`crisis-line-v1`)

- **Category**: `crisis-services`
- **Direction**: Bidirectional
- **Inbound**: Pull crisis referrals from hotline systems (e.g., 988 Suicide & Crisis Lifeline).
- **Outbound**: Push aid requests with crisis indicators for professional intervention.
- **Configuration**: Requires `endpoint` URL. Optional: `apiKey`, `organizationId`, `timeoutMs`, `supportedCrisisTypes`.

### Community 311 Connector (`community-311-v1`)

- **Category**: `municipal-311`
- **Direction**: Bidirectional
- **Inbound**: Pull service requests from municipal 311 systems (Open311 compatible).
- **Outbound**: Push community-identified needs to 311 for municipal follow-up.
- **Configuration**: Requires `endpoint` URL. Optional: `apiKey`, `jurisdictionId`, `timeoutMs`, `supportedCategories`.

## Governance rules

### Connector approval

1. All connectors must implement the `ConnectorContract` interface.
2. Health checks must be implemented and return within 30 seconds.
3. Connectors must handle graceful shutdown without data loss.
4. Retry policies must be configured to prevent external system overload.

### Data handling

1. Connectors must not store credentials in audit trails or sync records.
2. PII in sync payloads must follow the platform's privacy redaction rules.
3. Outbound syncs must include rate limiting to prevent abuse.
4. Inbound syncs must validate data before storing.

### Deployment

1. Connectors are deployed as instances per tenant.
2. Each instance has isolated configuration and credentials.
3. Marketplace listings require review before publication.
4. Deprecated connectors must provide a migration path.

### Monitoring

1. Health checks should run at regular intervals (recommended: every 60 seconds).
2. Sync failure rates should be monitored and alerted on.
3. Audit trails should be retained for at least 90 days.
4. Connector performance metrics should be exposed via the standard SLI framework.
