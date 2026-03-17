import { z } from 'zod';
import { didSchema, isoDateTimeSchema } from './schemas.js';

// ---------------------------------------------------------------------------
// Connector status
// ---------------------------------------------------------------------------

export const CONNECTOR_STATUSES = [
    'registered',
    'configured',
    'active',
    'paused',
    'error',
    'decommissioned',
] as const;

export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const connectorStatusSchema = z.enum(CONNECTOR_STATUSES);

// ---------------------------------------------------------------------------
// Connector category
// ---------------------------------------------------------------------------

export const CONNECTOR_CATEGORIES = [
    'crisis-services',
    'municipal-311',
    'community-hub',
    'healthcare',
    'social-services',
    'transportation',
    'custom',
] as const;

export type ConnectorCategory = (typeof CONNECTOR_CATEGORIES)[number];

export const connectorCategorySchema = z.enum(CONNECTOR_CATEGORIES);

// ---------------------------------------------------------------------------
// Sync direction
// ---------------------------------------------------------------------------

export const SYNC_DIRECTIONS = ['inbound', 'outbound', 'bidirectional'] as const;

export type SyncDirection = (typeof SYNC_DIRECTIONS)[number];

export const syncDirectionSchema = z.enum(SYNC_DIRECTIONS);

// ---------------------------------------------------------------------------
// Sync status
// ---------------------------------------------------------------------------

export const CONNECTOR_SYNC_STATUSES = [
    'pending',
    'in_progress',
    'completed',
    'failed',
    'retrying',
    'skipped',
] as const;

export type ConnectorSyncStatus = (typeof CONNECTOR_SYNC_STATUSES)[number];

export const connectorSyncStatusSchema = z.enum(CONNECTOR_SYNC_STATUSES);

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

export const RETRY_STRATEGIES = [
    'fixed-delay',
    'exponential-backoff',
    'linear-backoff',
] as const;

export type RetryStrategy = (typeof RETRY_STRATEGIES)[number];

export const retryStrategySchema = z.enum(RETRY_STRATEGIES);

export const retryPolicySchema = z.object({
    strategy: retryStrategySchema,
    maxRetries: z.number().int().min(0).max(10).default(3),
    initialDelayMs: z.number().int().min(100).max(60_000).default(1_000),
    maxDelayMs: z.number().int().min(1_000).max(300_000).default(60_000),
    backoffMultiplier: z.number().min(1).max(10).default(2),
});

export type ConnectorRetryPolicy = z.infer<typeof retryPolicySchema>;

// ---------------------------------------------------------------------------
// Connector definition (marketplace registry entry)
// ---------------------------------------------------------------------------

export const connectorDefinitionSchema = z.object({
    connectorId: z.string().min(1),
    name: z.string().min(1).max(200),
    description: z.string().max(2000),
    category: connectorCategorySchema,
    version: z.string().min(1),
    author: z.string().min(1),
    status: connectorStatusSchema,
    syncDirection: syncDirectionSchema,
    configSchema: z.record(z.string(), z.unknown()).optional(),
    requiredScopes: z.array(z.string()),
    healthEndpoint: z.string().url().optional(),
    retryPolicy: retryPolicySchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
});

export type ConnectorDefinition = z.infer<typeof connectorDefinitionSchema>;

// ---------------------------------------------------------------------------
// Connector instance (a deployed connector for a specific tenant)
// ---------------------------------------------------------------------------

export const connectorInstanceSchema = z.object({
    instanceId: z.string().min(1),
    connectorId: z.string().min(1),
    tenantId: z.string().min(1),
    orgDid: didSchema,
    status: connectorStatusSchema,
    config: z.record(z.string(), z.unknown()),
    credentials: z.record(z.string(), z.unknown()).optional(),
    lastSyncAt: isoDateTimeSchema.optional(),
    lastHealthCheckAt: isoDateTimeSchema.optional(),
    isHealthy: z.boolean().default(true),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
});

export type ConnectorInstance = z.infer<typeof connectorInstanceSchema>;

// ---------------------------------------------------------------------------
// Sync flow record
// ---------------------------------------------------------------------------

export const syncFlowRecordSchema = z.object({
    syncId: z.string().min(1),
    instanceId: z.string().min(1),
    connectorId: z.string().min(1),
    direction: syncDirectionSchema,
    status: connectorSyncStatusSchema,
    recordsProcessed: z.number().int().nonnegative().default(0),
    recordsFailed: z.number().int().nonnegative().default(0),
    retryCount: z.number().int().nonnegative().default(0),
    errorMessage: z.string().optional(),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SyncFlowRecord = z.infer<typeof syncFlowRecordSchema>;

// ---------------------------------------------------------------------------
// Integration audit trail
// ---------------------------------------------------------------------------

export const INTEGRATION_AUDIT_ACTIONS = [
    'connector_registered',
    'connector_configured',
    'connector_activated',
    'connector_paused',
    'connector_decommissioned',
    'sync_started',
    'sync_completed',
    'sync_failed',
    'sync_retried',
    'health_check_passed',
    'health_check_failed',
    'config_updated',
    'credentials_rotated',
] as const;

export type IntegrationAuditAction = (typeof INTEGRATION_AUDIT_ACTIONS)[number];

export const integrationAuditActionSchema = z.enum(INTEGRATION_AUDIT_ACTIONS);

export const integrationAuditEntrySchema = z.object({
    auditId: z.string().min(1),
    action: integrationAuditActionSchema,
    connectorId: z.string().min(1),
    instanceId: z.string().min(1).optional(),
    actor: z.string().min(1),
    target: z.string().min(1),
    timestamp: isoDateTimeSchema,
    details: z.string().max(2000),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export type IntegrationAuditEntry = z.infer<typeof integrationAuditEntrySchema>;

// ---------------------------------------------------------------------------
// Marketplace registry types
// ---------------------------------------------------------------------------

export const MARKETPLACE_LISTING_STATUSES = [
    'draft',
    'published',
    'deprecated',
    'removed',
] as const;

export type MarketplaceListingStatus = (typeof MARKETPLACE_LISTING_STATUSES)[number];

export const marketplaceListingStatusSchema = z.enum(MARKETPLACE_LISTING_STATUSES);

export const marketplaceListingSchema = z.object({
    listingId: z.string().min(1),
    connectorId: z.string().min(1),
    status: marketplaceListingStatusSchema,
    displayName: z.string().min(1).max(200),
    shortDescription: z.string().max(500),
    fullDescription: z.string().max(5000),
    iconUrl: z.string().url().optional(),
    documentationUrl: z.string().url().optional(),
    supportUrl: z.string().url().optional(),
    tags: z.array(z.string().min(1).max(50)).max(20),
    installCount: z.number().int().nonnegative().default(0),
    rating: z.number().min(0).max(5).default(0),
    publishedAt: isoDateTimeSchema.optional(),
});

export type MarketplaceListing = z.infer<typeof marketplaceListingSchema>;

// ---------------------------------------------------------------------------
// Connector health check result
// ---------------------------------------------------------------------------

export interface ConnectorHealthCheck {
    connectorId: string;
    instanceId: string;
    isHealthy: boolean;
    latencyMs: number;
    message?: string;
    checkedAt: string;
}

// ---------------------------------------------------------------------------
// Connector SDK contracts (interface a connector must implement)
// ---------------------------------------------------------------------------

export interface ConnectorContract {
    /** Unique connector identifier. */
    connectorId: string;

    /** Initialize the connector with instance configuration. */
    initialize(config: Record<string, unknown>): Promise<void>;

    /** Execute an inbound sync (pull data from external system). */
    syncInbound(): Promise<SyncFlowRecord>;

    /** Execute an outbound sync (push data to external system). */
    syncOutbound(payload: unknown): Promise<SyncFlowRecord>;

    /** Perform a health check against the external system. */
    healthCheck(): Promise<ConnectorHealthCheck>;

    /** Gracefully shut down the connector. */
    shutdown(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Contract stubs for testing
// ---------------------------------------------------------------------------

export const integrationContractStubs = {
    connectorDefinition: {
        connectorId: 'crisis-line-v1',
        name: 'Crisis Line Connector',
        description: 'Integrates with 988 Suicide & Crisis Lifeline and similar crisis services.',
        category: 'crisis-services',
        version: '1.0.0',
        author: 'Patchwork Core Team',
        status: 'active',
        syncDirection: 'bidirectional',
        requiredScopes: ['read:crisis_data', 'write:referrals'],
        retryPolicy: {
            strategy: 'exponential-backoff',
            maxRetries: 3,
            initialDelayMs: 1_000,
            maxDelayMs: 60_000,
            backoffMultiplier: 2,
        },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    } satisfies ConnectorDefinition,

    connectorInstance: {
        instanceId: 'inst-001',
        connectorId: 'crisis-line-v1',
        tenantId: 'tenant-001',
        orgDid: 'did:example:org-1',
        status: 'active',
        config: { endpoint: 'https://crisis.example.com/api' },
        isHealthy: true,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    } satisfies ConnectorInstance,

    syncFlowRecord: {
        syncId: 'sync-001',
        instanceId: 'inst-001',
        connectorId: 'crisis-line-v1',
        direction: 'inbound',
        status: 'completed',
        recordsProcessed: 15,
        recordsFailed: 0,
        retryCount: 0,
        startedAt: new Date(0).toISOString(),
        completedAt: new Date(0).toISOString(),
    } satisfies SyncFlowRecord,

    auditEntry: {
        auditId: 'audit-001',
        action: 'sync_completed',
        connectorId: 'crisis-line-v1',
        instanceId: 'inst-001',
        actor: 'system',
        target: 'crisis-line-v1:inst-001',
        timestamp: new Date(0).toISOString(),
        details: 'Inbound sync completed: 15 records processed, 0 failed.',
    } satisfies IntegrationAuditEntry,

    marketplaceListing: {
        listingId: 'listing-001',
        connectorId: 'crisis-line-v1',
        status: 'published',
        displayName: 'Crisis Line Connector',
        shortDescription: 'Connect to crisis hotlines and referral services.',
        fullDescription: 'Full integration with 988 Suicide & Crisis Lifeline and similar crisis intervention services. Supports bidirectional referral sync.',
        tags: ['crisis', 'mental-health', 'referrals', '988'],
        installCount: 12,
        rating: 4.5,
        publishedAt: new Date(0).toISOString(),
    } satisfies MarketplaceListing,
};
