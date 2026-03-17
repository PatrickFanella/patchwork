# Service boundaries and ownership

## apps/web

- Renders user-facing map/feed/posting surfaces.
- Uses API contracts only; does not directly consume indexer/worker internals.

## apps/mobile

- Native iOS/Android client built with React Native.
- Consumes shared API contracts from `packages/shared` via `@patchwork/shared`.
- Mobile-specific contracts (device info, push notifications, offline sync) defined in shared package.
- Navigation model maps core mobile flows to tab-based structure with deep link support.

## services/api

- Responsible for synchronous request/response APIs.
- Owns identity flow boundaries and external client contract compatibility.
- Owns chat anti-spam safety evaluation and safety metrics exposure.

## services/indexer

- Responsible for ingestion normalization and read-model indexing.
- Produces/consumes event contracts defined in shared package.

## services/moderation-worker

- Responsible for asynchronous moderation queue views and policy action workflows.
- Owns moderation decision/event + appeal audit boundaries.

## packages/shared

- Shared env/config contract and validation.
- Shared cross-service contracts and event interfaces.
- Shared moderation queue domain, anti-spam logic primitives, and privacy redaction utilities.
- Multi-region tenant model, routing policies, failover configuration, and data residency rules.
- Integrations marketplace contracts, connector SDK framework, retry policies, and sync flow types.

## Multi-region topology

### Region model

The platform supports six deployment regions: `us-east`, `us-west`, `eu-west`, `eu-central`, `ap-southeast`, `ap-northeast`. Each tenant is assigned a primary region and a set of allowed regions.

### Tenant partitioning

- Each tenant is bound to a primary region where data is stored by default.
- Data residency policies (`region-locked`, `region-preferred`, `global`) control where tenant data may reside.
- Tenant boundary enforcement validates every request against allowed regions and tenant status.

### Routing

- Four routing strategies are supported: `primary-only`, `nearest-region`, `weighted-round-robin`, `failover-chain`.
- Region endpoints have configurable weights and active/inactive status.
- The `failover-chain` strategy walks a configured ordered list of backup regions when the primary is unhealthy.

### Failover

- Automatic failover is triggered when consecutive health check failures exceed a configurable threshold.
- Failover events are recorded in an audit trail for observability and incident review.
- Manual failover mode allows operators to control region switching explicitly.
- Failback occurs automatically when a previously unhealthy region recovers.

### Policy overrides

- Region-specific policy overrides allow tenants to adjust rate limits, data retention, moderation rules, feature flags, and compliance settings per region.
- Overrides can have expiration dates and are scoped to specific policy categories.

## Integrations architecture

### Connector framework

- Connectors implement a standard `ConnectorContract` interface: `initialize`, `syncInbound`, `syncOutbound`, `healthCheck`, `shutdown`.
- Each connector has a definition (registry entry) and can have multiple instances deployed per tenant.
- Sync flows support inbound (pull from external) and outbound (push to external) directions.

### Retry and audit

- Configurable retry policies: `fixed-delay`, `exponential-backoff`, `linear-backoff`.
- All connector lifecycle events and sync operations are recorded in an integration audit trail.
- Failed syncs record error messages and retry counts for debugging.

### Marketplace

- Connector definitions can be published as marketplace listings with display metadata, tags, ratings, and install counts.
- Listing statuses progress through `draft` -> `published` -> `deprecated` -> `removed`.

### Production connectors

1. **Crisis Line Connector** (`crisis-line-v1`): Bidirectional integration with crisis hotlines (988 Suicide & Crisis Lifeline). Supports inbound referral pull and outbound crisis escalation.
2. **Community 311 Connector** (`community-311-v1`): Bidirectional integration with municipal 311 service systems. Supports inbound service request pull and outbound community need reporting.
