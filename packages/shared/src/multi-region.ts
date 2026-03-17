import { z } from 'zod';
import { didSchema, isoDateTimeSchema } from './schemas.js';

// ---------------------------------------------------------------------------
// Region definitions
// ---------------------------------------------------------------------------

export const REGIONS = [
    'us-east',
    'us-west',
    'eu-west',
    'eu-central',
    'ap-southeast',
    'ap-northeast',
] as const;

export type Region = (typeof REGIONS)[number];

export const regionSchema = z.enum(REGIONS);

/**
 * Check if a string is a valid Region.
 */
export function isValidRegion(value: string): value is Region {
    return REGIONS.includes(value as Region);
}

// ---------------------------------------------------------------------------
// Data residency policy
// ---------------------------------------------------------------------------

export const DATA_RESIDENCY_POLICIES = [
    'region-locked',
    'region-preferred',
    'global',
] as const;

export type DataResidencyPolicy = (typeof DATA_RESIDENCY_POLICIES)[number];

export const dataResidencyPolicySchema = z.enum(DATA_RESIDENCY_POLICIES);

// ---------------------------------------------------------------------------
// Tenant status
// ---------------------------------------------------------------------------

export const TENANT_STATUSES = [
    'active',
    'suspended',
    'migrating',
    'deprovisioned',
] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const tenantStatusSchema = z.enum(TENANT_STATUSES);

// ---------------------------------------------------------------------------
// Failover mode
// ---------------------------------------------------------------------------

export const FAILOVER_MODES = [
    'automatic',
    'manual',
    'disabled',
] as const;

export type FailoverMode = (typeof FAILOVER_MODES)[number];

export const failoverModeSchema = z.enum(FAILOVER_MODES);

// ---------------------------------------------------------------------------
// Tenant definition
// ---------------------------------------------------------------------------

export const tenantSchema = z.object({
    tenantId: z.string().min(1),
    orgDid: didSchema,
    name: z.string().min(1).max(200),
    primaryRegion: regionSchema,
    allowedRegions: z.array(regionSchema).min(1),
    dataResidency: dataResidencyPolicySchema,
    status: tenantStatusSchema,
    failoverMode: failoverModeSchema,
    failoverTargetRegion: regionSchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
});

export type Tenant = z.infer<typeof tenantSchema>;

// ---------------------------------------------------------------------------
// Region endpoint configuration
// ---------------------------------------------------------------------------

export const regionEndpointSchema = z.object({
    region: regionSchema,
    apiUrl: z.string().url(),
    healthUrl: z.string().url(),
    weight: z.number().int().min(0).max(100).default(100),
    isActive: z.boolean().default(true),
});

export type RegionEndpoint = z.infer<typeof regionEndpointSchema>;

// ---------------------------------------------------------------------------
// Routing policy
// ---------------------------------------------------------------------------

export const ROUTING_STRATEGIES = [
    'primary-only',
    'nearest-region',
    'weighted-round-robin',
    'failover-chain',
] as const;

export type RoutingStrategy = (typeof ROUTING_STRATEGIES)[number];

export const routingStrategySchema = z.enum(ROUTING_STRATEGIES);

export const routingPolicySchema = z.object({
    tenantId: z.string().min(1),
    strategy: routingStrategySchema,
    primaryRegion: regionSchema,
    failoverChain: z.array(regionSchema),
    endpoints: z.array(regionEndpointSchema),
});

export type RoutingPolicy = z.infer<typeof routingPolicySchema>;

// ---------------------------------------------------------------------------
// Routing decision (output of routing resolution)
// ---------------------------------------------------------------------------

export interface RegionRoutingDecision {
    tenantId: string;
    selectedRegion: Region;
    endpoint: RegionEndpoint;
    reason: 'primary' | 'nearest' | 'weighted' | 'failover' | 'fallback';
    failoverAttempt: number;
}

// ---------------------------------------------------------------------------
// Failover configuration
// ---------------------------------------------------------------------------

export const failoverConfigSchema = z.object({
    tenantId: z.string().min(1),
    mode: failoverModeSchema,
    healthCheckIntervalMs: z.number().int().min(1000).default(30_000),
    unhealthyThreshold: z.number().int().min(1).max(10).default(3),
    healthyThreshold: z.number().int().min(1).max(10).default(2),
    failoverChain: z.array(regionSchema).min(1),
    maxFailoverAttempts: z.number().int().min(1).max(5).default(3),
});

export type FailoverConfig = z.infer<typeof failoverConfigSchema>;

// ---------------------------------------------------------------------------
// Failover event (audit trail for failover decisions)
// ---------------------------------------------------------------------------

export const FAILOVER_EVENT_TYPES = [
    'failover_initiated',
    'failover_completed',
    'failover_failed',
    'failback_initiated',
    'failback_completed',
    'health_check_failed',
    'health_check_recovered',
] as const;

export type FailoverEventType = (typeof FAILOVER_EVENT_TYPES)[number];

export interface FailoverEvent {
    eventId: string;
    tenantId: string;
    eventType: FailoverEventType;
    fromRegion: Region;
    toRegion: Region;
    reason: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Region health status
// ---------------------------------------------------------------------------

export interface RegionHealthStatus {
    region: Region;
    isHealthy: boolean;
    consecutiveFailures: number;
    lastCheckAt: string;
    latencyMs: number;
    message?: string;
}

// ---------------------------------------------------------------------------
// Policy override (region-specific policy adjustments)
// ---------------------------------------------------------------------------

export const POLICY_OVERRIDE_SCOPES = [
    'rate-limit',
    'data-retention',
    'moderation',
    'feature-flag',
    'compliance',
] as const;

export type PolicyOverrideScope = (typeof POLICY_OVERRIDE_SCOPES)[number];

export const policyOverrideScopeSchema = z.enum(POLICY_OVERRIDE_SCOPES);

export const policyOverrideSchema = z.object({
    overrideId: z.string().min(1),
    tenantId: z.string().min(1),
    region: regionSchema,
    scope: policyOverrideScopeSchema,
    key: z.string().min(1),
    value: z.unknown(),
    reason: z.string().max(500),
    createdAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.optional(),
});

export type PolicyOverride = z.infer<typeof policyOverrideSchema>;

// ---------------------------------------------------------------------------
// Tenant boundary validation result
// ---------------------------------------------------------------------------

export interface TenantBoundaryValidation {
    valid: boolean;
    code:
        | 'OK'
        | 'TENANT_NOT_FOUND'
        | 'TENANT_SUSPENDED'
        | 'REGION_NOT_ALLOWED'
        | 'DATA_RESIDENCY_VIOLATION'
        | 'TENANT_MIGRATING';
    message: string;
}

// ---------------------------------------------------------------------------
// Cross-region request envelope
// ---------------------------------------------------------------------------

export interface CrossRegionRequest {
    tenantId: string;
    sourceRegion: Region;
    targetRegion: Region;
    requestId: string;
    payload: unknown;
    timestamp: string;
}

// ---------------------------------------------------------------------------
// Contract stubs for testing
// ---------------------------------------------------------------------------

export const multiRegionContractStubs = {
    tenant: {
        tenantId: 'tenant-001',
        orgDid: 'did:example:org-1',
        name: 'Test Mutual Aid Network',
        primaryRegion: 'us-east',
        allowedRegions: ['us-east', 'us-west'],
        dataResidency: 'region-preferred',
        status: 'active',
        failoverMode: 'automatic',
        failoverTargetRegion: 'us-west',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    } satisfies Tenant,

    routingPolicy: {
        tenantId: 'tenant-001',
        strategy: 'failover-chain',
        primaryRegion: 'us-east',
        failoverChain: ['us-west', 'eu-west'],
        endpoints: [
            {
                region: 'us-east',
                apiUrl: 'https://us-east.api.patchwork.example',
                healthUrl: 'https://us-east.api.patchwork.example/health',
                weight: 100,
                isActive: true,
            },
            {
                region: 'us-west',
                apiUrl: 'https://us-west.api.patchwork.example',
                healthUrl: 'https://us-west.api.patchwork.example/health',
                weight: 80,
                isActive: true,
            },
        ],
    } satisfies RoutingPolicy,

    failoverConfig: {
        tenantId: 'tenant-001',
        mode: 'automatic',
        healthCheckIntervalMs: 30_000,
        unhealthyThreshold: 3,
        healthyThreshold: 2,
        failoverChain: ['us-west', 'eu-west'],
        maxFailoverAttempts: 3,
    } satisfies FailoverConfig,

    policyOverride: {
        overrideId: 'override-001',
        tenantId: 'tenant-001',
        region: 'eu-west',
        scope: 'compliance',
        key: 'data-retention-days',
        value: 90,
        reason: 'EU GDPR compliance requires shorter retention',
        createdAt: new Date(0).toISOString(),
        expiresAt: undefined,
    } satisfies PolicyOverride,
};
